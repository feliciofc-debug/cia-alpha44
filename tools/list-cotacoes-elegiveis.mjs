import { prisma } from "@cia/db";

function pode(it, meta) {
  const m = meta ?? {};
  if (m.ncmRevisadoHumano && m.ncmConfirmado === (it.ncm || "").replace(/\D/g, "").slice(0, 8)) return false;
  const ncm = (it.ncm || "").replace(/\D/g, "").padStart(8, "0").slice(0, 8);
  if (!ncm || ncm === "00000000") return false;
  if (m.compatibilidadeProduto === "incompativel") return false;
  if (m.compatibilidadeProduto === "revisar") return true;
  if (m.ncmValido === false) return true;
  if (m.ncmFonte === "pendente") return true;
  if (m.ncmConfianca != null && m.ncmConfianca < 0.85) return true;
  return false;
}

const rows = await prisma.cotacao.findMany({
  orderBy: { criadoEm: "desc" },
  take: 20,
  include: { itens: true, tenant: { select: { slug: true } } },
});

for (const r of rows) {
  const eleg = r.itens.filter((it) => pode(it, it.meta)).length;
  const conf = r.itens.filter((it) => it.meta && typeof it.meta === "object" && it.meta.ncmRevisadoHumano).length;
  console.log(
    `${r.tenant.slug.padEnd(40)} ${r.id} itens=${r.itens.length} eleg=${eleg} confirmados=${conf} cliente=${(r.cliente ?? "").slice(0, 25)}`,
  );
}
await prisma.$disconnect();
