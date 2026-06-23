import { prisma } from "../packages/db/dist/index.js";
const rows = await prisma.cotacao.findMany({
  orderBy: { criadoEm: "desc" },
  take: 3,
  select: { id: true, cliente: true, params: true, resultadoCalculo: true, tenant: { select: { slug: true } } },
});
for (const r of rows) {
  const params = r.params;
  const res = r.resultadoCalculo;
  console.log(r.tenant.slug, r.id, r.cliente, "markupPct=", params?.markupPct, "saida.markup=", res?.saida?.markup);
}
await prisma.$disconnect();
