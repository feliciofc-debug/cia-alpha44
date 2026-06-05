/** Servidor Fastify — API do CIA / Alpha 44. */

import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { cotacaoSchema } from "@cia/shared";
import { getState } from "./state.js";
import { buscarCambioPtax } from "./services/cambio.js";
import { calcularCotacao, montarItens } from "./services/cotacao.js";
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

  return app;
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
