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
  listarCotacoes,
  PersistenciaIndisponivelError,
  salvarCotacao,
} from "./services/cotacoes-persist.js";
import { ingerirArquivo } from "./services/ingest.js";

const PORT = Number(process.env.PORT ?? 3333);
const HOST = process.env.HOST ?? "0.0.0.0";

/** Produção (Render): WEB_ORIGIN=https://app.seudominio.com.br — aceita várias origens separadas por vírgula. */
function corsOrigins(): boolean | string[] {
  const raw = process.env.WEB_ORIGIN?.trim();
  if (!raw) return true;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

export async function buildServer() {
  const app = Fastify({ logger: true });
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
      comexTotal: s.comexSeed.length,
      benefFiscal: "ALAGOAS",
    };
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
