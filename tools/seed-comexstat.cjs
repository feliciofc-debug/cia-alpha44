// Gera o seed de benchmark ComexStat a partir de "IMPORTAÇÕES DA CHINA NOVO.xlsx".
// Saída: packages/pipeline/src/data/comexstat-china-2023s1.json
// Uso: node tools/seed-comexstat.cjs "<arquivo.xlsx>"
const XLSX = require("xlsx");
const fs = require("node:fs");
const path = require("node:path");

const file = process.argv[2];
if (!file) {
  console.error('Uso: node tools/seed-comexstat.cjs "<arquivo.xlsx>"');
  process.exit(1);
}

const wb = XLSX.readFile(file);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

// Localiza a linha de cabeçalho (contém "COD SUBITEM NCM").
let headerIdx = rows.findIndex(
  (r) => Array.isArray(r) && r.some((c) => String(c).toUpperCase().includes("COD SUBITEM NCM")),
);
if (headerIdx < 0) headerIdx = 3;

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const map = new Map();
for (let i = headerIdx + 1; i < rows.length; i++) {
  const r = rows[i];
  if (!Array.isArray(r)) continue;
  const ncm = String(r[0] ?? "").replace(/\D/g, "");
  if (ncm.length !== 8) continue;
  const desc = String(r[1] ?? "").replace(/^['\-\s]+/, "").trim();
  const fobKg = num(r[3]);
  const cifKg = num(r[4]);
  const amostra = num(r[5]) ?? 0;
  if (fobKg === null && cifKg === null) continue;

  // Agrega quando o mesmo NCM aparece mais de uma vez (média ponderada por amostra).
  const prev = map.get(ncm);
  if (prev) {
    const a = prev.amostra + amostra || 1;
    prev.fobKg = fobKg !== null ? (prev.fobKg * prev.amostra + fobKg * amostra) / a : prev.fobKg;
    prev.cifKg = cifKg !== null ? (prev.cifKg * prev.amostra + cifKg * amostra) / a : prev.cifKg;
    prev.amostra = a;
  } else {
    map.set(ncm, { ncm, desc, fobKg: fobKg ?? 0, cifKg: cifKg ?? 0, amostra });
  }
}

const data = {
  fonte: "ComexStat",
  contexto: "1º semestre 2023 · China (país 160) · via marítima",
  geradoEm: new Date().toISOString(),
  total: map.size,
  itens: Array.from(map.values()).map((e) => ({
    ncm: e.ncm,
    desc: e.desc.slice(0, 120),
    fobKg: Number(e.fobKg.toFixed(6)),
    cifKg: Number(e.cifKg.toFixed(6)),
    amostra: e.amostra,
  })),
};

const outDir = path.join(__dirname, "..", "packages", "pipeline", "src", "data");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "comexstat-china-2023s1.json");
fs.writeFileSync(outFile, JSON.stringify(data, null, 0), "utf8");
console.log(`OK: ${data.total} NCMs -> ${outFile}`);
