#!/usr/bin/env node
/** Diagnóstico item filtro de óleo — cotação Argentina. */
import { PrismaClient } from "@prisma/client";

const COT = process.argv[2] ?? "cmqgl0qip0054kwwnffs8mq9n";
const p = new PrismaClient();
const row = await p.cotacao.findUnique({
  where: { id: COT },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
if (!row) {
  console.error("Cotação não encontrada");
  process.exit(1);
}
const it = row.itens.find((i) => /filtro/i.test(i.descPt || i.descOriginal || ""));
if (!it) {
  console.error("Item filtro não encontrado");
  process.exit(1);
}
const meta = it.meta ?? {};
console.log(
  JSON.stringify(
    {
      ordem: it.ordem,
      ncm: it.ncm,
      desc: (it.descPt || it.descOriginal || "").slice(0, 100),
      compatibilidadeProduto: meta.compatibilidadeProduto,
      familiaProdutoId: meta.familiaProdutoId,
      ncmRevisadoHumano: meta.ncmRevisadoHumano,
      ncmConfirmado: meta.ncmConfirmado,
      motivoCompatibilidade: meta.motivoCompatibilidade?.slice?.(0, 120),
    },
    null,
    2,
  ),
);
await p.$disconnect();
