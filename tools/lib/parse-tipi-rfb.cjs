/**
 * Parser IPI — TIPI oficial RFB (tipi.xlsx).
 * "NT" → ipi 0 + flag ipiNt; célula vazia em NCM-8 → não encontrado.
 */

const XLSX = require("xlsx");
const { normCodigoNcm, normNcm8 } = require("./ncm-utils.cjs");

function extrairVigenciaTipi(rows) {
  /** @type {string[]} */
  const ades = [];
  for (const row of rows.slice(0, 30)) {
    for (const cell of row) {
      const s = String(cell ?? "");
      const matches = s.matchAll(/Ato Declaratório Executivo RFB nº\s*(\d+).*?de\s*(\d{1,2})\s*de\s*(\w+)\s*de\s*(\d{4})/gi);
      for (const m of matches) ades.push(`ADE RFB ${m[1]}/${m[4]}`);
      if (/Decreto nº\s*12\.665/i.test(s)) ades.push("Decreto 12.665/2025");
    }
  }
  if (ades.length) return ades[ades.length - 1];
  return "TIPI RFB vigente";
}

/**
 * @typedef {{ rate: number, ipiNt: boolean, explicitZero: boolean }} IpiEntry
 */

/**
 * @param {string} filePath
 * @returns {{ map: Map<string, IpiEntry>, vigencia: string, fonte: string }}
 */
function parseTipiRfb(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets["Tabela Completa"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  /** @type {Map<string, IpiEntry>} */
  const map = new Map();
  /** @type {IpiEntry | null} */
  let cur = null;

  for (const row of rows) {
    const codigo = normCodigoNcm(row[0]);
    if (!codigo) continue;
    const aliRaw = String(row[3] ?? "").trim();
    if (aliRaw) {
      if (/^NT$/i.test(aliRaw)) {
        cur = { rate: 0, ipiNt: true, explicitZero: false };
      } else {
        const n = parseFloat(aliRaw.replace(",", "."));
        if (Number.isFinite(n)) {
          cur = { rate: n, ipiNt: false, explicitZero: n === 0 };
        }
      }
    }
    const ncm8 = normNcm8(codigo);
    if (ncm8 && cur != null) map.set(ncm8, { ...cur });
  }

  return {
    map,
    vigencia: extrairVigenciaTipi(rows),
    fonte: "RFB — TIPI (tipi.xlsx)",
  };
}

module.exports = { parseTipiRfb };
