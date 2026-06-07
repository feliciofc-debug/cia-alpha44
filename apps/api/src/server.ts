/** Servidor Fastify — API do CIA / Alpha 44. */

import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { cotacaoSchema, listarUfsFiscais } from "@cia/shared";
import { getState } from "./state.js";
import { buscarCambioPtax } from "./services/cambio.js";
import { calcularCotacao, montarItens } from "./services/cotacao.js";
import {
  atualizarCotacao,
  buscarCotacao,
  duplicarCotacao,
  excluirCotacao,
  listarCotacoes,
  PersistenciaIndisponivelError,
  salvarCotacao,
} from "./services/cotacoes-persist.js";
import { ingerirArquivo } from "./services/ingest.js";
import { listarClientesDashboard } from "./services/dashboard-clientes.js";
import { obterDashboardKpis } from "./services/dashboard-kpis.js";
import { obterRelatorioFaturamento } from "./services/dashboard-relatorio.js";
import { obterSeriesMensais } from "./services/dashboard-series.js";
import { gerarPdfRelatorioFaturamento } from "./services/pdf-relatorio-faturamento.js";
import { gerarPdfCotacao, gerarPdfFromPayload } from "./services/pdf-cotacao.js";
import { conferirNcmItens } from "./services/ncm-conferencia.js";
import { lerFotoItem } from "./services/fotos.js";

const PDF_GERACAO_TIMEOUT_MS = 45_000;

function comTimeout<T>(promise: Promise<T>, ms: number, mensagem: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(mensagem)), ms);
    }),
  ]);
}

const PORT = Number(process.env.PORT ?? 3333);
const HOST = process.env.HOST ?? "0.0.0.0";

/** Produção (Render): WEB_ORIGIN=https://app.seudominio.com.br — aceita várias origens separadas por vírgula. */
function corsOrigins(): boolean | string[] {
  const raw = process.env.WEB_ORIGIN?.trim();
  if (!raw) return true;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

export async function buildServer() {
  const app = Fastify({ logger: true, bodyLimit: 35 * 1024 * 1024 });
  await app.register(cors, { origin: corsOrigins() });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  app.get("/api/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.get("/api/meta", async () => {
    const s = getState();
    return {
      provider: s.provider.nome,
      llmDisponivel: s.provider.disponivel,
      ocrProvider: s.ocr.nome,
      ocrDisponivel: s.ocr.disponivel,
      siscomexProvider: s.siscomex.nome,
      siscomexConfigurado: s.siscomex.configurado,
      siscomexOperacional: s.siscomex.operacional,
      comexTotal: s.comexSeed.length,
      benefFiscal: "ALAGOAS",
    };
  });

  app.get("/api/siscomex/status", async () => {
    const s = getState().siscomex;
    return {
      provider: s.nome,
      configurado: s.configurado,
      operacional: s.operacional,
      ambiente: s.config.ambiente,
      modoAuth: s.config.modoAuth,
      mensagem: s.operacional
        ? "Portal Único ativo — consultas CLSF/TTCE habilitadas."
        : s.configurado
          ? "Credenciais detectadas — aguardando SISCOMEX_ATIVO=true e homologação."
          : "Inativo — configure certificado ou chaves de acesso (ver docs/SISCOMEX.md).",
    };
  });

  const conferirNcmBody = z.object({
    itens: z.array(
      z.object({
        indice: z.number().int().min(0).optional(),
        ncmPlanilha: z.string().nullable().optional(),
        ncmIa: z.string().nullable().optional(),
        descricao: z.string().nullable().optional(),
      }),
    ),
  });

  /** Conferência NCM isolada — não altera /api/classificar nem /api/calcular. */
  app.post("/api/ncm/conferir", async (req, reply) => {
    const parsed = conferirNcmBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
    }
    return conferirNcmItens(getState().siscomex, parsed.data.itens);
  });

  app.get("/api/cambio", async (req) => {
    const moeda = (req.query as { moeda?: string }).moeda ?? "USD";
    return buscarCambioPtax(moeda.toUpperCase());
  });

  app.get("/api/fiscal/ufs", async (req) => {
    const benef = (req.query as { benefFiscal?: string }).benefFiscal ?? "ALAGOAS";
    return { ufs: listarUfsFiscais(benef) };
  });

  // Upload: planilha (.xlsx/.csv) ou PDF/imagem (OCR) → linhas para cotação.
  app.post("/api/parse", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ erro: "Envie um arquivo no campo 'file' (.xlsx, .csv, .pdf ou imagem)." });
    }
    try {
      const buf = await file.toBuffer();
      return await ingerirArquivo(file.filename, new Uint8Array(buf), getState().ocr);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao processar arquivo.";
      return reply.status(422).send({ erro: msg });
    }
  });

  // Linhas cruas → itens de domínio (tradução + NCM + DUIMP via IA, alíquotas via TEC).
  app.post("/api/classificar", async (req, reply) => {
    const body = z.object({ linhas: z.array(z.any()) }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ erro: "Body inválido", detalhe: body.error.flatten() });
    const { itens, provider } = await montarItens(body.data.linhas, getState());
    return { itens, provider };
  });

  // Cotação completa → engine fiscal + benchmark + calibragem + risco por item.
  app.post("/api/calcular", async (req, reply) => {
    const parsed = cotacaoSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ erro: "Cotação inválida", detalhe: parsed.error.flatten() });
    const { resultado, itens } = calcularCotacao(parsed.data, getState());
    return { resultado, itens };
  });

  const salvarBody = z.object({
    cotacao: cotacaoSchema,
    itens: z.array(z.any()),
    resultado: z.any().nullable().optional().default(null),
    provider: z.string().optional(),
  });

  app.get("/api/dashboard/kpis", async (_req, reply) => {
    try {
      return await obterDashboardKpis();
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.get("/api/dashboard/series", async (req, reply) => {
    try {
      const meses = Number((req.query as { meses?: string }).meses) || 12;
      return await obterSeriesMensais(Math.min(24, Math.max(3, meses)));
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.get("/api/dashboard/clientes", async (req, reply) => {
    try {
      const q = (req.query as { q?: string }).q;
      return await listarClientesDashboard(q);
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.get("/api/dashboard/relatorio", async (req, reply) => {
    try {
      const q = req.query as { ano?: string; mes?: string };
      const ano = Number(q.ano) || new Date().getFullYear();
      const mes = q.mes != null && q.mes !== "" ? Number(q.mes) : undefined;
      return await obterRelatorioFaturamento({ ano, mes });
    } catch (e) {
      if (e instanceof Error && (e.message === "Ano inválido." || e.message === "Mês inválido.")) {
        return reply.status(400).send({ erro: e.message });
      }
      return persistenciaErro(reply, e);
    }
  });

  app.get("/api/dashboard/relatorio/pdf", async (req, reply) => {
    try {
      const q = req.query as { ano?: string; mes?: string };
      const ano = Number(q.ano) || new Date().getFullYear();
      const mes = q.mes != null && q.mes !== "" ? Number(q.mes) : undefined;
      const rel = await obterRelatorioFaturamento({ ano, mes });
      const buf = await gerarPdfRelatorioFaturamento(rel);
      const slug = mes != null ? `${ano}-${String(mes).padStart(2, "0")}` : String(ano);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="cia-faturamento-${slug}.pdf"`)
        .send(buf);
    } catch (e) {
      if (e instanceof Error && (e.message === "Ano inválido." || e.message === "Mês inválido.")) {
        return reply.status(400).send({ erro: e.message });
      }
      const msg = e instanceof Error ? e.message : "Falha ao gerar relatório.";
      return reply.status(422).send({ erro: msg });
    }
  });

  app.get("/api/cotacoes", async (req, reply) => {
    try {
      const q = req.query as { cliente?: string; limite?: string };
      return await listarCotacoes({
        cliente: q.cliente,
        limite: q.limite ? Number(q.limite) : undefined,
      });
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.get("/api/cotacoes/:id/pdf", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const tipo = (req.query as { tipo?: string }).tipo === "trade" ? "trade" : "cliente";
      const row = await buscarCotacao(id);
      if (!row) return reply.status(404).send({ erro: "Cotação não encontrada." });
      const buf = await comTimeout(
        gerarPdfCotacao(row, tipo),
        PDF_GERACAO_TIMEOUT_MS,
        "Geração do PDF excedeu o tempo limite. Tente novamente.",
      );
      const nome = (row.cotacao.cliente || "cotacao").replace(/[^\w\-]+/g, "_").slice(0, 40);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="cia-${tipo}-${nome}.pdf"`)
        .send(buf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar PDF.";
      return reply.status(422).send({ erro: msg });
    }
  });

  app.get("/api/cotacoes/:id", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const row = await buscarCotacao(id);
      if (!row) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return row;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.get("/api/cotacoes/:id/foto/:ordem", async (req, reply) => {
    try {
      const { id, ordem } = req.params as { id: string; ordem: string };
      const row = await buscarCotacao(id);
      if (!row) return reply.status(404).send({ erro: "Cotação não encontrada." });
      const idx = Number(ordem);
      const item = row.itens[idx];
      if (!item?.fotoPath) return reply.status(404).send({ erro: "Foto não encontrada." });
      const foto = await lerFotoItem(item.fotoPath);
      if (!foto) return reply.status(404).send({ erro: "Arquivo de foto ausente." });
      return reply.header("Content-Type", foto.mime).header("Cache-Control", "public, max-age=86400").send(foto.buffer);
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.post("/api/cotacoes/preview-pdf", async (req, reply) => {
    const parsed = salvarBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
    try {
      const tipo = (req.query as { tipo?: string }).tipo === "trade" ? "trade" : "cliente";
      const buf = await comTimeout(
        gerarPdfFromPayload(
          {
            cotacao: parsed.data.cotacao,
            itens: parsed.data.itens as import("@cia/shared").Item[],
            resultado: parsed.data.resultado ?? null,
          },
          tipo,
        ),
        PDF_GERACAO_TIMEOUT_MS,
        "Geração do PDF excedeu o tempo limite. Tente novamente.",
      );
      const nome = (parsed.data.cotacao.cliente || "cotacao").replace(/[^\w\-]+/g, "_").slice(0, 40);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="cia-preview-${tipo}-${nome}.pdf"`)
        .send(buf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar PDF.";
      return reply.status(422).send({ erro: msg });
    }
  });

  app.post("/api/cotacoes", async (req, reply) => {
    const parsed = salvarBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
    try {
      return await salvarCotacao({
        cotacao: parsed.data.cotacao,
        itens: parsed.data.itens as import("@cia/shared").Item[],
        resultado: parsed.data.resultado ?? null,
        provider: parsed.data.provider,
      });
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  const despesaBody = z.object({
    nome: z.string(),
    valorBRL: z.number(),
    entraBaseSaida: z.boolean().default(true),
    entraBaseNota: z.boolean().default(true),
  });

  const atualizarCotacaoBody = z.object({
    origem: z.string().optional(),
    destino: z.string().optional(),
    benefFiscal: z.enum(["ALAGOAS", "NENHUM"]).optional(),
    empresaTrade: z.string().optional(),
    cliente: z.string().optional(),
    markupPct: z.number().min(0).max(1).optional(),
    despesas: z.array(despesaBody).optional(),
    icmsAuto: z.boolean().optional(),
    params: z
      .object({
        pisSaida: z.number().min(0).max(1).optional(),
        cofinsSaida: z.number().min(0).max(1).optional(),
        icmsSaida: z.number().min(0).max(1).optional(),
        csllSobreMarkup: z.number().min(0).max(1).optional(),
        irrfAliq: z.number().min(0).max(1).optional(),
        irrfBaseNotaPct: z.number().min(0).max(1).optional(),
      })
      .optional(),
  });

  async function handleAtualizarCotacao(id: string, body: z.infer<typeof atualizarCotacaoBody>, reply: import("fastify").FastifyReply) {
    try {
      const atualizada = await atualizarCotacao(id, getState(), body);
      if (!atualizada) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return atualizada;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  }

  app.patch("/api/cotacoes/:id", async (req, reply) => {
    const parsed = atualizarCotacaoBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    return handleAtualizarCotacao(id, parsed.data, reply);
  });

  app.patch("/api/cotacoes/:id/fiscal", async (req, reply) => {
    const parsed = atualizarCotacaoBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    return handleAtualizarCotacao(id, parsed.data, reply);
  });

  app.post("/api/cotacoes/:id/duplicar", async (req, reply) => {
    const body = z
      .object({ markupPct: z.number().min(0).max(1).optional(), cliente: z.string().optional() })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.status(400).send({ erro: "Body inválido", detalhe: body.error.flatten() });
    try {
      const { id } = req.params as { id: string };
      const dup = await duplicarCotacao(id, getState(), body.data);
      if (!dup) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return dup;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.delete("/api/cotacoes/:id", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const ok = await excluirCotacao(id);
      if (!ok) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return { ok: true };
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  return app;
}

function persistenciaErro(reply: import("fastify").FastifyReply, e: unknown) {
  if (e instanceof PersistenciaIndisponivelError) {
    return reply.status(503).send({ erro: e.message });
  }
  const msg = e instanceof Error ? e.message : "Erro de persistência.";
  return reply.status(500).send({ erro: msg });
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// roda quando executado diretamente (node dist/server.js | tsx src/server.ts)
main();
