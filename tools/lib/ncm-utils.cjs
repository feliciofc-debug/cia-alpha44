/** Utilitários NCM compartilhados pelos parsers de fontes oficiais. */

function normCodigoNcm(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 2 || d.length > 8) return null;
  return d;
}

function normNcm8(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 8) return d;
  if (d.length > 8) return d.slice(0, 8);
  return null;
}

function parsePercent(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

module.exports = { normCodigoNcm, normNcm8, parsePercent };
