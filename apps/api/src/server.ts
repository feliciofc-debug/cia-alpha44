/** Servidor Fastify — API do CIA / Alpha 44. */

import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { cotacaoSchema, listarUfsFiscais, mesclarAvisoMoedaCotacao } from "@cia/shared";
import type { LinhaCrua } from "@cia/pipeline";
import { criarPdfNcmAuditCtx, enriquecerItensPdfNcmAudit, getHistoricoBenchmarkStats } from "@cia/pipeline";
import { getState, recarregarNcmCatalog, recarregarComexBenchmark } from "./state.js";
import { buscarCambioPtax } from "./services/cambio.js";
import { calcularCotacao, compararRegimesDestino, montarItens } from "./services/cotacao.js";
import {
  atualizarCotacao,
  alterarCustoUnitarioVeiculoItem,
  alterarFobKgItem,
  alterarNcmItem,
  buscarCotacao,
  confirmarNcmItem,
  confirmarNcmItensLote,
  desfazerConfirmacaoNcmItem,
  duplicarCotacao,
  dryRunReclassificarCotacaoPersistida,
  excluirCotacao,
  listarCotacoes,
  PersistenciaIndisponivelError,
  reclassificarCotacaoPersistida,
  salvarCotacao,
} from "./services/cotacoes-persist.js";
import { importarBenchmarkPlanilha, statusBenchmarkPlanilha } from "./services/benchmark-planilha.js";
import { ingerirArquivo } from "./services/ingest.js";
import { listarClientesDashboard } from "./services/dashboard-clientes.js";
import { obterDashboardKpis } from "./services/dashboard-kpis.js";
import { obterRelatorioFaturamento } from "./services/dashboard-relatorio.js";
import { obterSeriesMensais } from "./services/dashboard-series.js";
import { gerarPdfRelatorioFaturamento } from "./services/pdf-relatorio-faturamento.js";
import { gerarPdfCotacao, gerarPdfFromPayload, type PdfBrandingOptions } from "./services/pdf-cotacao.js";
import { NcmInvalidoPdfError } from "./services/validar-ncm-pdf.js";
import { conciliarNcm, lookupNcm } from "./services/ncm-helper.js";
import { conferirNcmItens } from "./services/ncm-conferencia.js";
import { exportarConciliacao, exportarConciliacaoSalva } from "./services/conciliacao-export.js";
import { lerFotoItem } from "./services/fotos.js";
import {
  atualizarTenantBranding,
  lerTenantLogo,
  obterTenantBranding,
  removerTenantLogo,
  salvarTenantLogo,
  TENANT_LOGO_MAX_BYTES,
  TenantBrandingNotFoundError,
  TenantLogoInvalidaError,
} from "./services/tenant-branding.js";
import { registrarAuth } from "./auth/middleware.js";
import { registrarRotaLogin } from "./auth/login.js";
import { registrarRotaRegister } from "./auth/register.js";
import { registrarRotasAdminUsuarios } from "./auth/admin-usuarios.js";
import {
  registrarRateLimit,
  rateLimitClassificar,
  rateLimitParse,
  rateLimitNcmConferir,
} from "./auth/rate-limit.js";
import {
  ERRO_UPLOAD_EXCEDE_LIMITE,
  mensagemArquivoGrandeDemais,
  UPLOAD_MAX_BYTES,
} from "./upload-limits.js";
import type { FastifyRequest } from "fastify";
import { pathToFileURL } from "node:url";

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
function corsOrigins(): string[] {
  const raw = process.env.WEB_ORIGIN?.trim();
  if (process.env.NODE_ENV === "production" && !raw) {
    throw new Error("PROD sem WEB_ORIGIN — defina origens CORS explícitas (ex.: URL Vercel).");
  }
  if (!raw) return ["http://localhost:5173"];
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

function tenantSlug(req: FastifyRequest): string {
  return req.auth!.tenantSlug;
}

function pdfDynamicLogoEnabled(): boolean {
  return process.env.PDF_DYNAMIC_LOGO_ENABLED !== "false";
}

async function pdfBrandingOptions(req: FastifyRequest, tipo: "cliente" | "trade"): Promise<PdfBrandingOptions | undefined> {
  if (tipo !== "cliente" || !pdfDynamicLogoEnabled()) return undefined;
  const [branding, logo] = await Promise.all([
    obterTenantBranding(req.auth!.tenantId),
    lerTenantLogo(req.auth!.tenantId),
  ]);
  return {
    cliente: {
      usarLogoLegadaInnove: false,
      displayName: branding.hasTenantBranding ? branding.displayName : undefined,
      logoBuffer: logo?.buffer ?? null,
    },
  };
}

export async function buildServer() {
  const app = Fastify({ logger: true, bodyLimit: UPLOAD_MAX_BYTES });
  await app.register(cors, { origin: corsOrigins() });
  await app.register(multipart, { limits: { fileSize: UPLOAD_MAX_BYTES } });
  await registrarAuth(app);
  await registrarRotaLogin(app);
  await registrarRotaRegister(app);
  await registrarRotasAdminUsuarios(app);
  await registrarRateLimit(app);

  app.setErrorHandler((error: Error & { code?: string; statusCode?: number }, _req, reply) => {
    if (error.code === "FST_REQ_FILE_TOO_LARGE" || error.message?.includes("request file too large")) {
      return reply.status(422).send({ erro: mensagemArquivoGrandeDemais() });
    }
    const status = error.statusCode ?? 500;
    return reply.status(status).send({ erro: error.message });
  });

  app.get("/api/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.get("/api/meta", async () => {
    const s = getState();
    const planilha = statusBenchmarkPlanilha();
    return {
      provider: s.provider.nome,
      llmDisponivel: s.provider.disponivel,
      ocrProvider: s.ocr.nome,
      ocrDisponivel: s.ocr.disponivel,
      siscomexProvider: s.siscomex.nome,
      siscomexConfigurado: s.siscomex.configurado,
      siscomexOperacional: s.siscomex.operacional,
      comexTotal: s.comexSeed.length,
      ncmVigenteTotal: s.ncmCatalog.total,
      ncmVigenteAtualizado: s.ncmCatalog.dataUltimaAtualizacao,
      benefFiscal: "ALAGOAS",
      avisoBannerMsg: process.env.AVISO_BANNER_MSG?.trim() || null,
      planilhaFobKg: {
        carregado: planilha.carregado,
        total: planilha.total,
        historicoEmMemoria: getHistoricoBenchmarkStats().total,
        arquivo: planilha.arquivo,
        atualizadoEm: planilha.atualizadoEm,
        prioridade: "Fonte principal FOB/kg — prevalece sobre ComexStat",
      },
    };
  });

  app.get("/api/tenant/branding", async (req, reply) => {
    try {
      return await obterTenantBranding(req.auth!.tenantId);
    } catch (e) {
      if (e instanceof TenantBrandingNotFoundError) {
        return reply.status(404).send({ erro: e.message });
      }
      throw e;
    }
  });

  app.get("/api/tenant/branding/logo", async (req, reply) => {
    const logo = await lerTenantLogo(req.auth!.tenantId);
    if (!logo) {
      return reply.status(404).send({ erro: "Logo não configurada para este tenant." });
    }
    return reply.type(logo.mime).send(logo.buffer);
  });

  const tenantBrandingBody = z.object({
    displayName: z.string().trim().max(80).nullable().optional(),
    tagline: z.string().trim().max(120).nullable().optional(),
  });

  app.put("/api/tenant/branding", async (req, reply) => {
    const parsed = tenantBrandingBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
    try {
      return await atualizarTenantBranding({
        tenantId: req.auth!.tenantId,
        displayName: parsed.data.displayName,
        tagline: parsed.data.tagline,
      });
    } catch (e) {
      if (e instanceof TenantBrandingNotFoundError) {
        return reply.status(404).send({ erro: e.message });
      }
      throw e;
    }
  });

  app.post("/api/tenant/branding/logo", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.status(400).send({ erro: "Envie a logo no campo 'file'." });
    try {
      const buffer = await file.toBuffer();
      if (buffer.byteLength > TENANT_LOGO_MAX_BYTES) {
        return reply.status(422).send({ erro: "Logo excede 2 MB." });
      }
      return await salvarTenantLogo({ tenantId: req.auth!.tenantId, buffer });
    } catch (e) {
      if (e instanceof TenantLogoInvalidaError) {
        return reply.status(422).send({ erro: e.message });
      }
      if (e instanceof TenantBrandingNotFoundError) {
        return reply.status(404).send({ erro: e.message });
      }
      throw e;
    }
  });

  app.delete("/api/tenant/branding/logo", async (req, reply) => {
    try {
      return await removerTenantLogo(req.auth!.tenantId);
    } catch (e) {
      if (e instanceof TenantBrandingNotFoundError) {
        return reply.status(404).send({ erro: e.message });
      }
      throw e;
    }
  });

  app.get("/api/siscomex/status", async () => {
    const s = getState().siscomex;
    const cat = getState().ncmCatalog;
    const teste = s.testarConexao ? await s.testarConexao() : null;
    return {
      provider: s.nome,
      configurado: s.configurado,
      operacional: s.operacional,
      ambiente: s.config.ambiente,
      modoAuth: s.config.modoAuth,
      ncmVigenteTotal: cat.total,
      ncmVigenteAtualizado: cat.dataUltimaAtualizacao,
      ncmFonte: cat.fonte,
      conexao: teste,
      mensagem: s.operacional
        ? teste?.ok
          ? "Portal Único ativo — CLSF + TTCE ao vivo."
          : `Portal Único ativo mas conexão falhou: ${teste?.mensagem ?? "—"}`
        : s.configurado
          ? "Certificado OK — defina SISCOMEX_ATIVO=true para consultas ao vivo."
          : "Inativo — configure certificado (ver docs/SISCOMEX.md).",
    };
  });

  app.post("/api/siscomex/testar", async (_req, reply) => {
    const s = getState().siscomex;
    if (!s.configurado) {
      return reply.status(503).send({ ok: false, erro: "Certificado não configurado." });
    }
    if (!s.testarConexao) {
      return reply.status(501).send({ ok: false, erro: "Provider sem teste de conexão." });
    }
    const r = await s.testarConexao();
    if (!r.ok) return reply.status(502).send(r);
    return r;
  });

  app.get("/api/comexstat/status", async () => {
    const { getComexStatStats, COMEXSTAT_CHINA_MARITIMO_2023S1 } = await import("@cia/pipeline");
    const stats = getComexStatStats();
    return {
      fonte: "ComexStat API MDIC",
      apiUrl: "https://api-comexstat.mdic.gov.br/general",
      filtrosPadrao: COMEXSTAT_CHINA_MARITIMO_2023S1,
      totalNcmsCache: stats.total,
      contexto: stats.contexto,
      mensagem: `${stats.total} NCMs em cache · FOB/kg = metricFOB ÷ metricKG (importação China marítima)`,
    };
  });

  app.get("/api/comexstat/fob-kg/:ncm", async (req, reply) => {
    const ncm = String((req.params as { ncm: string }).ncm ?? "").replace(/\D/g, "");
    if (ncm.length !== 8) {
      return reply.status(400).send({ erro: "NCM inválido (8 dígitos)." });
    }
    const { fetchComexStatFobKg, lookupBenchmark } = await import("@cia/pipeline");
    const cache = lookupBenchmark(ncm);
    if (cache.fonte === "ComexStat" && cache.mediaFobKg) {
      return { ncm, fobKg: cache.mediaFobKg, cifKg: null, fonte: "cache", contexto: cache.nota };
    }
    try {
      const live = await fetchComexStatFobKg(ncm);
      if (!live) return reply.status(404).send({ erro: `Sem dados ComexStat para NCM ${ncm}.` });
      const s = getState();
      s.benchmarkIndex.comex.set(ncm, live);
      return { ncm, fobKg: live.fobKg, cifKg: live.cifKg, desc: live.desc, fonte: "api", contexto: "ComexStat ao vivo" };
    } catch (e) {
      return reply.status(502).send({ erro: e instanceof Error ? e.message : "Falha na API ComexStat" });
    }
  });

  app.post("/api/comexstat/atualizar", async (_req, reply) => {
    try {
      const { fetchComexStatSeed } = await import("@cia/pipeline");
      const data = await fetchComexStatSeed();
      recarregarComexBenchmark();
      return {
        ok: true,
        total: data.total,
        contexto: data.contexto,
        geradoEm: data.geradoEm,
        mensagem: "Benchmark ComexStat atualizado da API MDIC e recarregado em memória.",
      };
    } catch (e) {
      return reply.status(502).send({
        ok: false,
        erro: e instanceof Error ? e.message : "Falha ao atualizar ComexStat",
      });
    }
  });

  app.get("/api/benchmark/planilha/status", async () => statusBenchmarkPlanilha());

  app.post("/api/benchmark/planilha/upload", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ erro: "Envie a planilha no campo 'file' (.xlsx ou .csv)." });
    }
    const nome = file.filename.toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(nome)) {
      return reply.status(400).send({ erro: "Formato inválido. Use .xlsx ou .csv." });
    }
    try {
      const buf = await file.toBuffer();
      const seed = await importarBenchmarkPlanilha(getState(), new Uint8Array(buf), file.filename);
      return {
        ok: true,
        total: seed.total,
        arquivo: seed.arquivo,
        atualizadoEm: seed.atualizadoEm,
        contexto: seed.contexto,
        mensagem: `Planilha FOB/kg atualizada — ${seed.total} NCMs. Recalcule cotações abertas para aplicar os novos valores.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao importar planilha.";
      return reply.status(422).send({ ok: false, erro: msg });
    }
  });

  app.post("/api/siscomex/atualizar-ncm", async (_req, reply) => {
    try {
      const { execSync } = await import("node:child_process");
      const { fileURLToPath } = await import("node:url");
      const { dirname, join } = await import("node:path");
      const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
      execSync("node tools/fetch-ncm-siscomex.cjs", { cwd: root, stdio: "pipe" });
      const cat = recarregarNcmCatalog();
      return {
        ok: true,
        total: cat.total,
        dataUltimaAtualizacao: cat.dataUltimaAtualizacao,
        fonte: cat.fonte,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao atualizar NCM.";
      return reply.status(500).send({ ok: false, erro: msg });
    }
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
  app.post(
    "/api/ncm/conferir",
    { config: { rateLimit: rateLimitNcmConferir() } },
    async (req, reply) => {
      const parsed = conferirNcmBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
      }
      return conferirNcmItens(getState().siscomex, getState().ncmCatalog, parsed.data.itens);
    },
  );

  /** Lookup NCM — referência IA + catálogo CIA (informativo). */
  app.post("/api/ncm/lookup", async (req) => {
    const body = z.object({ ncm: z.string().min(1) }).safeParse(req.body ?? {});
    if (!body.success) return { ok: false, erro: "NCM obrigatório." };
    return lookupNcm(body.data.ncm, getState().ncmCatalog);
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
  app.post(
    "/api/parse",
    { config: { rateLimit: rateLimitParse() } },
    async (req, reply) => {
    let file;
    try {
      file = await req.file();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("file too large") || (e as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.status(422).send({ erro: ERRO_UPLOAD_EXCEDE_LIMITE });
      }
      throw e;
    }
    if (!file) {
      return reply.status(400).send({ erro: "Envie um arquivo no campo 'file' (.xlsx, .csv, .pdf ou imagem)." });
    }
    try {
      const buf = await file.toBuffer();
      return await ingerirArquivo(file.filename, new Uint8Array(buf), getState().ocr, getState().provider);
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg = e instanceof Error ? e.message : "Falha ao processar arquivo.";
      if (code === "FST_REQ_FILE_TOO_LARGE" || msg.includes("file too large")) {
        return reply.status(422).send({ erro: ERRO_UPLOAD_EXCEDE_LIMITE });
      }
      return reply.status(422).send({ erro: msg });
    }
  },
  );

  // Linhas cruas → itens de domínio (tradução + NCM + DUIMP via IA, alíquotas via TEC).
  app.post(
    "/api/classificar",
    { config: { rateLimit: rateLimitClassificar() } },
    async (req, reply) => {
    const linhaSchema = z.object({
      descOriginal: z.string().min(1, "descOriginal obrigatório"),
    }).passthrough();
    const body = z
      .object({
        linhas: z.array(linhaSchema).min(1, "Informe ao menos uma linha"),
        moedaPlanilha: z.string().nullable().optional(),
        cambioEurUsd: z.number().positive().nullable().optional(),
        cambioEurUsdData: z.string().nullable().optional(),
        cambioEurUsdFonte: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({
        erro: "Body inválido — cada linha deve ter descOriginal (string não vazia)",
        detalhe: body.error.flatten(),
      });
    }
    const { itens, provider, classificacaoCache, cambioEurUsd, cambioEurUsdData, cambioEurUsdFonte } =
      await montarItens(body.data.linhas as unknown as LinhaCrua[], getState(), {
        moedaPlanilha: body.data.moedaPlanilha,
        cambioEurUsd: body.data.cambioEurUsd,
        cambioEurUsdData: body.data.cambioEurUsdData,
        cambioEurUsdFonte: body.data.cambioEurUsdFonte,
      });
    const state = getState();
    const itensAudit = enriquecerItensPdfNcmAudit(itens, criarPdfNcmAuditCtx(state.ncmCatalog));
    return { itens: itensAudit, provider, classificacaoCache, cambioEurUsd, cambioEurUsdData, cambioEurUsdFonte };
  },
  );

  // Cotação completa → engine fiscal + benchmark + calibragem + risco por item.
  app.post("/api/calcular", async (req, reply) => {
    const parsed = cotacaoSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ erro: "Cotação inválida", detalhe: parsed.error.flatten() });
    const cotacao = mesclarAvisoMoedaCotacao(parsed.data);
    const state = getState();
    const { resultado, itens, icms, params } = calcularCotacao(cotacao, state);
    const itensAudit = enriquecerItensPdfNcmAudit(itens, criarPdfNcmAuditCtx(state.ncmCatalog));
    const avisosFiscais = cotacao.avisosFiscais ?? icms.avisosFiscais ?? [];
    return { resultado, itens: itensAudit, icms, avisosFiscais, params, moedaPlanilha: cotacao.moedaPlanilha ?? null };
  });

  const salvarBody = z.object({
    cotacao: cotacaoSchema,
    itens: z.array(z.any()),
    resultado: z.any().nullable().optional().default(null),
    provider: z.string().optional(),
  });

  app.get("/api/dashboard/kpis", async (req, reply) => {
    try {
      return await obterDashboardKpis(tenantSlug(req));
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.get("/api/dashboard/series", async (req, reply) => {
    try {
      const meses = Number((req.query as { meses?: string }).meses) || 12;
      return await obterSeriesMensais(tenantSlug(req), Math.min(24, Math.max(3, meses)));
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.get("/api/dashboard/clientes", async (req, reply) => {
    try {
      const q = (req.query as { q?: string }).q;
      return await listarClientesDashboard(tenantSlug(req), q);
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.get("/api/dashboard/relatorio", async (req, reply) => {
    try {
      const q = req.query as { ano?: string; mes?: string };
      const ano = Number(q.ano) || new Date().getFullYear();
      const mes = q.mes != null && q.mes !== "" ? Number(q.mes) : undefined;
      return await obterRelatorioFaturamento(tenantSlug(req), { ano, mes });
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
      const rel = await obterRelatorioFaturamento(tenantSlug(req), { ano, mes });
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
      return await listarCotacoes(tenantSlug(req), {
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
      const row = await buscarCotacao(id, tenantSlug(req), getState());
      if (!row) return reply.status(404).send({ erro: "Cotação não encontrada." });
      const branding = await pdfBrandingOptions(req, tipo);
      const buf = await comTimeout(
        gerarPdfCotacao(row, tipo, getState().ncmCatalog, branding),
        PDF_GERACAO_TIMEOUT_MS,
        "Geração do PDF excedeu o tempo limite. Tente novamente.",
      );
      const nome = (row.cotacao.cliente || "cotacao").replace(/[^\w\-]+/g, "_").slice(0, 40);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="cia-${tipo}-${nome}.pdf"`)
        .send(buf);
    } catch (e) {
      if (e instanceof NcmInvalidoPdfError) {
        return reply.status(422).send({ erro: e.message, codigo: e.codigo, itensInvalidos: e.itens });
      }
      const msg = e instanceof Error ? e.message : "Falha ao gerar PDF.";
      return reply.status(422).send({ erro: msg });
    }
  });

  app.get("/api/cotacoes/:id", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const row = await buscarCotacao(id, tenantSlug(req), getState());
      if (!row) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return row;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  /** Exportação conciliação — mesma persistência/tenant que GET /api/cotacoes/:id. */
  app.get("/api/cotacoes/:id/conciliacao", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const q = req.query as { formato?: string };
      const formato = q.formato === "csv" ? "csv" : "xlsx";
      const out = await exportarConciliacaoSalva(id, tenantSlug(req), formato, getState());
      if (!out) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return reply
        .header("Content-Type", out.contentType)
        .header("Content-Disposition", `attachment; filename="${out.filename}"`)
        .send(out.buffer);
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.post("/api/conciliacao/export", async (req, reply) => {
    const parsed = salvarBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
    }
    try {
      const q = req.query as { formato?: string };
      const formato = q.formato === "csv" ? "csv" : "xlsx";
      const out = await exportarConciliacao(
        {
          cotacao: parsed.data.cotacao,
          itens: parsed.data.itens as import("@cia/shared").Item[],
          resultado: (parsed.data.resultado ?? null) as import("@cia/fiscal-engine").ResultadoCotacao | null,
          provider: parsed.data.provider,
          cotacaoId: parsed.data.cotacao.id,
        },
        formato,
        getState(),
      );
      return reply
        .header("Content-Type", out.contentType)
        .header("Content-Disposition", `attachment; filename="${out.filename}"`)
        .send(out.buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao exportar conciliação.";
      return reply.status(422).send({ erro: msg });
    }
  });

  app.post("/api/cotacoes/:id/itens/:ordem/confirmar-ncm", async (req, reply) => {
    try {
      const { id, ordem } = req.params as { id: string; ordem: string };
      const idx = Number(ordem);
      if (!Number.isFinite(idx) || idx < 0) {
        return reply.status(400).send({ erro: "Índice de item inválido." });
      }
      const body = z.object({ confirmadoPor: z.string().optional() }).safeParse(req.body ?? {});
      const atualizada = await confirmarNcmItem(
        id,
        tenantSlug(req),
        idx,
        body.success ? body.data.confirmadoPor : undefined,
        getState(),
      );
      if (!atualizada) return reply.status(404).send({ erro: "Cotação ou item não encontrado." });
      return atualizada;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.post("/api/cotacoes/:id/itens/confirmar-ncm-lote", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = z.object({ confirmadoPor: z.string().optional() }).safeParse(req.body ?? {});
      const atualizada = await confirmarNcmItensLote(
        id,
        tenantSlug(req),
        body.success ? body.data.confirmadoPor : undefined,
        getState(),
      );
      if (!atualizada) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return atualizada;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.post("/api/cotacoes/:id/itens/:ordem/desfazer-ncm", async (req, reply) => {
    try {
      const { id, ordem } = req.params as { id: string; ordem: string };
      const idx = Number(ordem);
      if (!Number.isFinite(idx) || idx < 0) {
        return reply.status(400).send({ erro: "Índice de item inválido." });
      }
      const atualizada = await desfazerConfirmacaoNcmItem(id, tenantSlug(req), idx, undefined, getState().ncmCatalog);
      if (!atualizada) return reply.status(404).send({ erro: "Cotação ou item não encontrado." });
      return atualizada;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.patch("/api/cotacoes/:id/itens/:ordem/ncm", async (req, reply) => {
    try {
      const { id, ordem } = req.params as { id: string; ordem: string };
      const idx = Number(ordem);
      if (!Number.isFinite(idx) || idx < 0) {
        return reply.status(400).send({ erro: "Índice de item inválido." });
      }
      const body = z.object({ ncm: z.string().min(1) }).safeParse(req.body ?? {});
      if (!body.success) return reply.status(400).send({ erro: "NCM obrigatório." });
      const atualizada = await alterarNcmItem(id, tenantSlug(req), idx, body.data.ncm, getState());
      if (!atualizada) return reply.status(404).send({ erro: "Cotação ou item não encontrado." });
      return atualizada;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao alterar NCM.";
      if (msg.includes("NCM inválido")) return reply.status(400).send({ erro: msg });
      return persistenciaErro(reply, e);
    }
  });

  app.patch("/api/cotacoes/:id/itens/:ordem/fob-kg", async (req, reply) => {
    try {
      const { id, ordem } = req.params as { id: string; ordem: string };
      const idx = Number(ordem);
      if (!Number.isFinite(idx) || idx < 0) {
        return reply.status(400).send({ erro: "Ordem de item inválida." });
      }
      const body = z
        .object({
          fobKgManual: z.number().nonnegative().nullable(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) return reply.status(400).send({ erro: "Body inválido — use { fobKgManual: number | null }." });
      const atualizada = await alterarFobKgItem(id, tenantSlug(req), idx, body.data.fobKgManual, getState());
      if (!atualizada) return reply.status(404).send({ erro: "Cotação ou item não encontrado." });
      return atualizada;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao alterar FOB/kg.";
      if (msg.includes("fobKgManual inválido")) return reply.status(400).send({ erro: msg });
      return persistenciaErro(reply, e);
    }
  });

  app.patch("/api/cotacoes/:id/itens/:ordem/custo-unitario-veiculo", async (req, reply) => {
    try {
      const { id, ordem } = req.params as { id: string; ordem: string };
      const idx = Number(ordem);
      if (!Number.isFinite(idx) || idx < 0) {
        return reply.status(400).send({ erro: "Ordem de item inválida." });
      }
      const body = z
        .object({
          custoUnitarioUS: z.number().positive(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) return reply.status(400).send({ erro: "Body inválido — use { custoUnitarioUS: number }." });
      const atualizada = await alterarCustoUnitarioVeiculoItem(
        id,
        tenantSlug(req),
        idx,
        body.data.custoUnitarioUS,
        getState(),
      );
      if (!atualizada) return reply.status(404).send({ erro: "Cotação ou item não encontrado." });
      return atualizada;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao alterar custo unitário.";
      if (msg.includes("custoUnitarioUS inválido") || msg.includes("não identificado como veículo")) {
        return reply.status(400).send({ erro: msg });
      }
      return persistenciaErro(reply, e);
    }
  });

  /** Conciliação NCM por IA — qualidade informativa; NCM do usuário prevalece. */
  app.post("/api/cotacoes/:id/itens/:ordem/conciliar-ncm", async (req) => {
    try {
      const { id, ordem } = req.params as { id: string; ordem: string };
      const ordemNum = Number(ordem);
      if (!Number.isFinite(ordemNum) || ordemNum < 1) {
        return {
          ok: false,
          status: "sem_sugestao" as const,
          ncmInformado: "",
          erro: "Ordem de item inválida.",
        };
      }
      const cotacao = await buscarCotacao(id, tenantSlug(req), getState());
      if (!cotacao) {
        return {
          ok: false,
          status: "sem_sugestao" as const,
          ncmInformado: "",
          erro: "Cotação não encontrada.",
        };
      }
      const item = cotacao.itens.find((it) => (it.ordem ?? 0) === ordemNum);
      if (!item) {
        return {
          ok: false,
          status: "sem_sugestao" as const,
          ncmInformado: "",
          erro: "Item não encontrado.",
        };
      }
      return conciliarNcm(item, getState().ncmCatalog);
    } catch (e) {
      return {
        ok: false,
        status: "sem_sugestao" as const,
        ncmInformado: "",
        erro: e instanceof Error ? e.message : "Falha na conciliação.",
      };
    }
  });

  app.get("/api/cotacoes/:id/foto/:ordem", async (req, reply) => {
    try {
      const { id, ordem } = req.params as { id: string; ordem: string };
      const row = await buscarCotacao(id, tenantSlug(req), getState());
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
      const branding = await pdfBrandingOptions(req, tipo);
      const buf = await comTimeout(
        gerarPdfFromPayload(
          {
            cotacao: parsed.data.cotacao,
            itens: parsed.data.itens as import("@cia/shared").Item[],
            resultado: parsed.data.resultado ?? null,
          },
          tipo,
          getState().ncmCatalog,
          branding,
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
      if (e instanceof NcmInvalidoPdfError) {
        return reply.status(422).send({ erro: e.message, codigo: e.codigo, itensInvalidos: e.itens });
      }
      const msg = e instanceof Error ? e.message : "Falha ao gerar PDF.";
      return reply.status(422).send({ erro: msg });
    }
  });

  app.post("/api/cotacoes", async (req, reply) => {
    const parsed = salvarBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
    try {
      return await salvarCotacao({
        tenantSlug: tenantSlug(req),
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
    destinoSelecao: z.string().optional(),
    benefFiscal: z.enum(["ALAGOAS", "NENHUM"]).optional(),
    ufEmpresa: z.string().optional(),
    regimeIcms: z.enum(["AL_DIFERIDO", "NORMAL"]).optional(),
    regimeDestinoId: z.string().nullable().optional(),
    regimeDestinoParams: z
      .object({
        icmsImportacaoAliq: z.number().min(0).max(1),
        icmsSaidaEfetivaAliq: z.number().min(0).max(1),
        aliqFundos: z.number().min(0).max(1),
        difalAliq: z.number().min(0).max(1).optional(),
      })
      .nullable()
      .optional(),
    empresaTrade: z.string().optional(),
    cliente: z.string().optional(),
    cambio: z.number().positive().optional(),
    freteTotalUS: z.number().nonnegative().optional(),
    siscomex: z.number().nonnegative().optional(),
    adicionaisVaUS: z.number().nonnegative().optional(),
    reducaoBaseUS: z.number().nonnegative().optional(),
    markupPct: z.number().min(0).max(1).optional(),
    qtdContainers: z.number().int().positive().optional(),
    outrasDespesasBaseBRL: z.number().nonnegative().optional(),
    despesas: z.array(despesaBody).optional(),
    icmsAuto: z.boolean().optional(),
    confirmarIcmsSaida: z.boolean().optional(),
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
    itensAliquotas: z
      .array(
        z.object({
          ordem: z.number().int().nonnegative(),
          aliquotas: z
            .object({
              ii: z.number().min(0).max(1),
              ipi: z.number().min(0).max(1),
              pis: z.number().min(0).max(1),
              cofins: z.number().min(0).max(1),
              icmsEntrada: z.number().min(0).max(1),
            })
            .optional(),
          aliquotasOverride: z.boolean().optional(),
          desfazerTributos: z.array(z.enum(["ii", "ipi", "pis", "cofins"])).optional(),
        }),
      )
      .optional(),
  });

  async function handleAtualizarCotacao(
    id: string,
    body: z.infer<typeof atualizarCotacaoBody>,
    req: FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) {
    try {
      const atualizada = await atualizarCotacao(id, tenantSlug(req), getState(), body);
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
    return handleAtualizarCotacao(id, parsed.data, req, reply);
  });

  app.patch("/api/cotacoes/:id/fiscal", async (req, reply) => {
    const parsed = atualizarCotacaoBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ erro: "Body inválido", detalhe: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    return handleAtualizarCotacao(id, parsed.data, req, reply);
  });

  app.get("/api/cotacoes/:id/comparar-regimes", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const salva = await buscarCotacao(id, tenantSlug(req), getState());
      if (!salva) return reply.status(404).send({ erro: "Cotação não encontrada." });
      const linhas = compararRegimesDestino(salva.cotacao, getState());
      return { linhas };
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.post("/api/cotacoes/:id/duplicar", async (req, reply) => {
    const body = z
      .object({ markupPct: z.number().min(0).max(1).optional(), cliente: z.string().optional() })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.status(400).send({ erro: "Body inválido", detalhe: body.error.flatten() });
    try {
      const { id } = req.params as { id: string };
      const dup = await duplicarCotacao(id, tenantSlug(req), getState(), body.data);
      if (!dup) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return dup;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.post("/api/cotacoes/:id/reclassificar", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const dryRun =
        String((req.query as { dryRun?: string | boolean } | undefined)?.dryRun ?? "").toLowerCase() === "1" ||
        String((req.query as { dryRun?: string | boolean } | undefined)?.dryRun ?? "").toLowerCase() === "true";
      if (dryRun) {
        const preview = await dryRunReclassificarCotacaoPersistida(id, tenantSlug(req), getState());
        if (!preview) return reply.status(404).send({ erro: "Cotação não encontrada." });
        return preview;
      }
      const atualizada = await reclassificarCotacaoPersistida(id, tenantSlug(req), getState());
      if (!atualizada) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return atualizada;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.post("/api/cotacoes/:id/reclassificar-dry-run", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const preview = await dryRunReclassificarCotacaoPersistida(id, tenantSlug(req), getState());
      if (!preview) return reply.status(404).send({ erro: "Cotação não encontrada." });
      return preview;
    } catch (e) {
      return persistenciaErro(reply, e);
    }
  });

  app.delete("/api/cotacoes/:id", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const ok = await excluirCotacao(id, tenantSlug(req));
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
const ehEntradaDireta =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (ehEntradaDireta) {
  main();
}
