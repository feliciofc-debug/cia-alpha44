/**
 * Parser II — planilha MDIC Res. Gecex 272/2021 (Anexos I e II).
 * Preferência: Anexo II "Alíquota aplicada (%)" > Anexo I TEC base.
 */

const XLSX = require("xlsx");
const { normNcm8, parsePercent } = require("./ncm-utils.cjs");

function extrairVigenciaTec(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Anexo II - Diferentes da TEC"], { header: 1, defval: "" });
  for (const row of rows.slice(0, 5)) {
    const txt = row.map((c) => String(c ?? "")).join(" ");
    const m = txt.match(/Atualizado até Resolução Gecex nº\s*(\d+).*?(\d{4})/i);
    if (m) return `Res. Gecex ${m[1]}/20${m[2].slice(-2)} (Anexo II tarifa aplicada BR)`;
    if (/Atualizado até/i.test(txt)) return txt.replace(/^\*?\s*/, "").trim();
  }
  const r1 = String(rows[1]?.[0] ?? "");
  if (r1.includes("Gecex")) return r1.replace(/^\*?\s*/, "").trim();
  return "Res. Gecex 272/2021";
}

function parseAnexoI(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Anexo I - TEC"], { header: 1, defval: "" });
  /** @type {Map<string, number>} */
  const map = new Map();
  let cur = null;
  for (const row of rows) {
    const codigo = normNcm8(row[0]);
    if (!codigo) continue;
    const rate = parsePercent(row[2]);
    if (rate != null) cur = rate;
    if (codigo.length === 8 && cur != null) map.set(codigo, cur);
  }
  return map;
}

function parseAnexoII(wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Anexo II - Diferentes da TEC"], { header: 1, defval: "" });
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const row of rows) {
    const codigo = normNcm8(row[0]);
    if (!codigo || codigo.length !== 8) continue;
    const applied = parsePercent(row[5]);
    if (applied != null) map.set(codigo, applied);
  }
  return map;
}

/**
 * @param {string} filePath
 * @returns {{ map: Map<string, number>, vigencia: string, fonte: string }}
 */
function parseTecMdic(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const anexoI = parseAnexoI(wb);
  const anexoII = parseAnexoII(wb);
  /** @type {Map<string, number>} */
  const map = new Map(anexoI);
  for (const [k, v] of anexoII) map.set(k, v);
  const vigencia = extrairVigenciaTec(wb);
  return {
    map,
    vigencia,
    fonte: "MDIC/CAMEX — Res. Gecex 272/2021 (Anexo II alíquota aplicada BR, fallback Anexo I TEC)",
  };
}

module.exports = { parseTecMdic };
