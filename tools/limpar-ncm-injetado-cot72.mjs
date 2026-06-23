#!/usr/bin/env node
/**
 * Remove NCM injetado por patch/legado na cotação 72 — prepara reclassificação limpa.
 * NÃO apaga confirmação humana (ncmRevisadoHumano).
 *
 * Uso na VPS:
 *   source /etc/cia-alpha44/api.env
 *   node tools/limpar-ncm-injetado-cot72.mjs [cotacaoId]
 */
import { PrismaClient } from "@prisma/client";

const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const p = new PrismaClient();

const row = await p.cotacao.findUnique({
  where: { id: COT_ID },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
if (!row) {
  console.error("Cotação não encontrada:", COT_ID);
  process.exit(1);
}

let limpos = 0;
for (const it of row.itens) {
  const meta = it.meta && typeof it.meta === "object" ? { ...it.meta } : {};
  const humano = meta.ncmRevisadoHumano === true;
  const status = meta.ncmEmbarqueStatus;
  const tinhaInjetado =
    !humano &&
    status !== "coluna" &&
    (meta.ncmPlanilhaOriginal || meta.ncmEmbarque);

  if (!tinhaInjetado) continue;

  delete meta.ncmPlanilhaOriginal;
  meta.ncmEmbarque = null;
  meta.ncmEmbarqueStatus = "sem-ncm-coluna";

  await p.item.update({
    where: { id: it.id },
    data: { meta },
  });
  console.log(`ordem ${it.ordem}: NCM injetado removido`);
  limpos += 1;
}

console.log(`\nLimpos: ${limpos}/${row.itens.length} itens — pronto para reclassificar.`);
await p.$disconnect();
