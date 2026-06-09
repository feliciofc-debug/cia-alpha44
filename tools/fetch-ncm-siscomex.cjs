/**
 * Baixa a tabela NCM vigente do Portal Único Siscomex (API pública, sem certificado)
 * e gera cache compacto em packages/pipeline/src/data/ncm-vigente.json
 *
 * GET https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO
 * @see https://docs.portalunico.siscomex.gov.br/rn/r36-guaiba/
 */

const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const URL =
  "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO";
const OUT = join(__dirname, "..", "packages", "pipeline", "src", "data", "ncm-vigente.json");

async function main() {
  console.log("Baixando NCM vigente Siscomex…");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  const nomenclaturas = raw.Nomenclaturas ?? [];
  const itens = {};
  for (const row of nomenclaturas) {
    const codigo = String(row.Codigo ?? row.codigo ?? "").replace(/\D/g, "");
    if (codigo.length !== 8) continue;
    itens[codigo] = String(row.Descricao ?? row.descricao ?? "").trim();
  }
  const out = {
    fonte: "Portal Único Siscomex — Classif (API pública)",
    dataUltimaAtualizacao: raw.Data_Ultima_Atualizacao_NCM ?? null,
    total: Object.keys(itens).length,
    itens,
  };
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`OK — ${out.total} NCMs de 8 dígitos → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
