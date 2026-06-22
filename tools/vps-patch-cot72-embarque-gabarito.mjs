#!/usr/bin/env node
/**
 * Injeta NCM embarque (gabarito fatura 72) no meta dos itens — necessário quando
 * cotação foi gravada sem ncmPlanilhaOriginal. Depois rode vps-reclassificar-cotacao.mjs.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const __dir = dirname(fileURLToPath(import.meta.url));
const gabarito = JSON.parse(
  readFileSync(join(__dir, "fixtures/cotacao-72-gabarito.json"), "utf8"),
);
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";

const byModelo = new Map(gabarito.itens.map((i) => [i.modelo, i.ncm]));

function modelo(desc) {
  const d = String(desc ?? "");
  if (/H004.*25cm|25cm折叠锯/i.test(d)) return "H004-25";
  if (/H004.*30cm|30cm折叠锯/i.test(d)) return "H004-30";
  const m = d.match(/^(HY-\d+|KHS-[A-Z0-9]+|H\d+)/);
  return m?.[1] ?? null;
}

const p = new PrismaClient();
const row = await p.cotacao.findUnique({
  where: { id: COT_ID },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
if (!row) {
  console.error("Cotação não encontrada:", COT_ID);
  process.exit(1);
}

let ok = 0;
for (const it of row.itens) {
  const mod = modelo(it.descOriginal);
  const ncm = mod ? byModelo.get(mod) : null;
  if (!ncm) {
    console.warn(`SKIP ordem ${it.ordem} — modelo não mapeado: ${it.descOriginal?.slice(0, 40)}`);
    continue;
  }
  const meta = it.meta && typeof it.meta === "object" ? { ...it.meta } : {};
  meta.ncmEmbarque = ncm;
  meta.ncmPlanilhaOriginal = ncm;
  delete meta.fobEmbarqueUS;
  delete meta.fobPendente;
  await p.item.update({
    where: { id: it.id },
    data: { meta },
  });
  console.log(`${it.ordem}\t${mod}\t${ncm}`);
  ok += 1;
}
console.log(`Patch OK: ${ok}/${row.itens.length} itens`);
await p.$disconnect();
