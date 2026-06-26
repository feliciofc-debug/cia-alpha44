#!/usr/bin/env node
/**
 * Diagnóstico isolado: prova se o helper NCM realmente usa a imagem.
 *
 * Uso na VPS:
 *   cd /opt/cia-alpha44
 *   set -a; source /etc/cia-alpha44/api.env; set +a
 *   node tools/teste-visao-helper.mjs
 *
 * Variáveis opcionais:
 *   COT72_ID=cmqlfuhvm000ykw2cue1whldj
 *   VISION_TEST_ORDENS=0,9
 *   FOTOS_DIR=/caminho/para/fotos
 *   NCM_HELPER_BASE_URL=https://ncm-helper-ai.lovable.app
 *   NCM_HELPER_SUGERIR_URL=https://.../api/public/sugerir-ncm
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";

const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const ORDENS = (process.env.VISION_TEST_ORDENS ?? "0,9")
  .split(",")
  .map((v) => Number.parseInt(v.trim(), 10))
  .filter((v) => Number.isInteger(v) && v >= 0);

const FOTOS_DIR = process.env.FOTOS_DIR
  ? resolve(process.env.FOTOS_DIR)
  : join(process.cwd(), "data", "fotos");

const HELPER_URL =
  process.env.NCM_HELPER_SUGERIR_URL?.trim() ||
  `${(process.env.NCM_HELPER_BASE_URL ?? "https://ncm-helper-ai.lovable.app").replace(/\/$/, "")}/api/public/sugerir-ncm`;

const prisma = new PrismaClient();

function mimeFromPath(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function fotoFullPath(fotoPath) {
  if (!fotoPath) return null;
  return isAbsolute(fotoPath) ? fotoPath : join(FOTOS_DIR, fotoPath);
}

function rawPretty(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function printHeader(title) {
  console.log("\n" + "=".repeat(80));
  console.log(title);
  console.log("=".repeat(80));
}

async function testarItem(item) {
  printHeader(`ITEM ${item.ordem}`);
  console.log(`cotacaoId:     ${COT_ID}`);
  console.log(`descOriginal:  ${item.descOriginal}`);
  console.log(`descPt atual:  ${item.descPt ?? ""}`);
  console.log(`ncm atual:     ${item.ncm ?? ""}`);
  console.log(`fotoPath:      ${item.fotoPath ?? "(null)"}`);
  console.log(`FOTOS_DIR:     ${FOTOS_DIR}`);

  const fullPath = fotoFullPath(item.fotoPath);
  console.log(`foto fullPath: ${fullPath ?? "(null)"}`);
  console.log(`foto existe:   ${fullPath ? existsSync(fullPath) : false}`);

  if (!fullPath || !existsSync(fullPath)) {
    console.log("ERRO: foto não encontrada. Confira FOTOS_DIR ou fotoPath no banco.");
    return;
  }

  const mime = mimeFromPath(fullPath);
  const base64 = readFileSync(fullPath).toString("base64");
  console.log(`foto mime:     ${mime}`);
  console.log(`foto bytes:    ${Buffer.byteLength(base64, "base64")}`);
  console.log(`helper url:    ${HELPER_URL}`);

  const body = {
    descricao:
      "TESTE DE VISAO REAL. Antes de sugerir NCM, descreva na justificativaRGI e/ou infoQueAjuda o que voce VE na imagem. " +
      "Use frases literais como 'vejo balanca de gancho', 'vejo kit de silicone', 'vejo fritadeira/air fryer' se for o caso. " +
      "Se nao conseguir interpretar a imagem, diga explicitamente 'nao consegui reconhecer a imagem'. " +
      `Texto do item: ${item.descOriginal}`,
    material: null,
    uso: null,
    ncmAtual: null,
    max: 4,
    imagem: {
      base64,
      mime,
      regra:
        "Diagnostico: a resposta deve provar reconhecimento visual, nao apenas devolver NCM.",
    },
  };

  const res = await fetch(HELPER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  const text = await res.text();
  console.log(`helper status: ${res.status}`);
  console.log(`content-type:  ${res.headers.get("content-type") ?? ""}`);
  console.log("RAW RESPONSE:");
  console.log(rawPretty(text));
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL ausente. Rode: set -a; source /etc/cia-alpha44/api.env; set +a");
  }
  if (!ORDENS.length) {
    throw new Error("VISION_TEST_ORDENS não contém ordens válidas.");
  }

  console.log("Diagnóstico helper visão");
  console.log(`Cotação: ${COT_ID}`);
  console.log(`Ordens:  ${ORDENS.join(", ")}`);
  console.log(`Fotos:   ${FOTOS_DIR}`);
  console.log(`Helper:  ${HELPER_URL}`);

  const itens = await prisma.item.findMany({
    where: { cotacaoId: COT_ID, ordem: { in: ORDENS } },
    orderBy: { ordem: "asc" },
    select: {
      ordem: true,
      descOriginal: true,
      descPt: true,
      ncm: true,
      fotoPath: true,
    },
  });

  const encontrados = new Set(itens.map((it) => it.ordem));
  for (const ordem of ORDENS) {
    if (!encontrados.has(ordem)) {
      printHeader(`ITEM ${ordem}`);
      console.log("ERRO: item não encontrado no banco.");
    }
  }

  for (const item of itens) {
    await testarItem(item);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
