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

/** Normaliza código Classif (remove pontos/espaços) — ex.: "9405.1" → "94051". */
function normCodigo(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 2 && d.length <= 8 ? d : null;
}

/** Remove marcadores visuais de hierarquia ("-", "--") da descrição Siscomex. */
function limparDescricao(desc) {
  return String(desc ?? "")
    .replace(/^[-–—\s]+/, "")
    .trim();
}

/**
 * Monta caminho hierárquico percorrendo TODOS os prefixos existentes (2–8 dígitos).
 * Inclui níveis intermediários de 5 e 7 dígitos (ex.: 94051, 8504401).
 */
function montarCompleta(codigo8, indice) {
  const partes = [];
  for (let len = 2; len <= 8; len++) {
    const prefixo = codigo8.slice(0, len);
    const desc = indice.get(prefixo);
    if (desc) partes.push(limparDescricao(desc));
  }
  return partes.join(" > ");
}

async function main() {
  console.log("Baixando NCM vigente Siscomex…");
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  const nomenclaturas = raw.Nomenclaturas ?? [];

  /** @type {Map<string, string>} */
  const indice = new Map();
  for (const row of nomenclaturas) {
    const codigo = normCodigo(row.Codigo ?? row.codigo);
    if (!codigo) continue;
    const descricao = String(row.Descricao ?? row.descricao ?? "").trim();
    if (!descricao) continue;
    indice.set(codigo, descricao);
  }

  const itens = {};
  let semAncestral = 0;
  for (const [codigo, descricaoRaw] of indice) {
    if (codigo.length !== 8) continue;
    const folha = limparDescricao(descricaoRaw);
    const completa = montarCompleta(codigo, indice);
    if (!completa || completa === folha) semAncestral++;
    itens[codigo] = { folha, completa: completa || folha };
  }

  const out = {
    fonte: "Portal Único Siscomex — Classif (API pública)",
    dataUltimaAtualizacao: raw.Data_Ultima_Atualizacao_NCM ?? null,
    total: Object.keys(itens).length,
    niveisIndexados: indice.size,
    itens,
  };
  writeFileSync(OUT, JSON.stringify(out));
  console.log(
    `OK — ${out.total} NCMs de 8 dígitos, ${out.niveisIndexados} níveis indexados (${semAncestral} sem ancestral além da folha) → ${OUT}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
