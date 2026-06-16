/**
 * Diagnóstico idx (array) × item.ordem (DB) numa cotação salva.
 *
 * Uso:
 *   node tools/check-ordem-itens.mjs <cotacaoId>
 *   node tools/check-ordem-itens.mjs --busca Argentina
 *
 * Requer DATABASE_URL (Prisma) ou CIA_API + token para GET /api/cotacoes/:id.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null) process.env[k] = v;
  }
}

loadEnvFile(join(root, ".env"));

const args = process.argv.slice(2);
const buscaIdx = args.indexOf("--busca");
const termoBusca = buscaIdx >= 0 ? args[buscaIdx + 1] : null;
const cotacaoId = args.find((a) => !a.startsWith("--") && a !== termoBusca);

function listar(itens, titulo) {
  console.log(`\n=== ${titulo} (${itens.length} itens) ===\n`);
  console.log("idxArray | ordem | ncm      | desc");
  console.log("---------+-------+----------+-----");
  const divergencias = [];
  for (const [idx, it] of itens.entries()) {
    const ordem = it.ordem ?? idx;
    const ncm = (it.ncm ?? "").replace(/\D/g, "").padStart(8, "0");
    const desc = (it.descPt || it.descOriginal || "").slice(0, 40);
    const flag = idx !== ordem ? " ← DIVERGE" : "";
    if (idx !== ordem) divergencias.push({ idx, ordem, ncm, desc });
    console.log(`${String(idx).padStart(8)} | ${String(ordem).padStart(5)} | ${ncm} | ${desc}${flag}`);
  }
  if (divergencias.length) {
    console.log(`\n⚠ ${divergencias.length} divergência(s) idx ≠ ordem:`);
    for (const d of divergencias) console.log(`  idx=${d.idx} ordem=${d.ordem} ncm=${d.ncm} | ${d.desc}`);
  } else {
    console.log("\n✓ idx === ordem em todos os itens (array alinhado com DB).");
  }
  const erva = itens.find((it) => /erva.?mate/i.test(it.descPt || it.descOriginal || ""));
  if (erva) {
    const idx = itens.indexOf(erva);
    const ordem = erva.ordem ?? idx;
    console.log(`\nErva-mate: idx=${idx} ordem=${ordem} ncm=${(erva.ncm ?? "").replace(/\D/g, "")}`);
  }
}

async function viaPrisma(id) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    let row;
    if (id) {
      row = await prisma.cotacao.findUnique({ where: { id }, include: { itens: true } });
    } else if (termoBusca) {
      row = await prisma.cotacao.findFirst({
        where: {
          OR: [
            { cliente: { contains: termoBusca, mode: "insensitive" } },
            { origem: { contains: termoBusca, mode: "insensitive" } },
            { destino: { contains: termoBusca, mode: "insensitive" } },
          ],
        },
        orderBy: { criadoEm: "desc" },
        include: { itens: true },
      });
    }
    if (!row) {
      console.error("Cotação não encontrada.");
      process.exit(1);
    }
    console.log(`Cotação: ${row.id} | ${row.cliente} | ${row.origem}→${row.destino}`);
    const itens = [...row.itens].sort((a, b) => a.ordem - b.ordem).map((it) => ({
      ordem: it.ordem,
      ncm: it.ncm,
      descOriginal: it.descOriginal,
      descPt: it.descPt,
    }));
    listar(itens, "Prisma (ordenado por ordem)");
  } finally {
    await prisma.$disconnect();
  }
}

async function viaApi(id) {
  const base = process.env.CIA_API || process.env.VITE_API_URL || "http://localhost:3333";
  const token = process.env.CIA_TOKEN || process.env.CLERK_BEARER;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${base}/api/cotacoes/${id}`, { headers });
  if (!res.ok) {
    console.error(`API ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  console.log(`Cotação: ${data.id} | ${data.cotacao?.cliente}`);
  listar(data.itens ?? [], "API GET /cotacoes/:id");
}

async function main() {
  if (!cotacaoId && !termoBusca) {
    console.error("Uso: node tools/check-ordem-itens.mjs <cotacaoId> | --busca <termo>");
    process.exit(1);
  }
  if (process.env.DATABASE_URL) {
    await viaPrisma(cotacaoId);
    return;
  }
  if (!cotacaoId) {
    console.error("Sem DATABASE_URL: informe cotacaoId para consultar via API.");
    process.exit(1);
  }
  await viaApi(cotacaoId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
