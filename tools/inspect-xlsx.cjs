// Inspeciona uma planilha .xlsx: lista abas, dimensões e dumpa as primeiras N linhas
// Uso: node tools/inspect-xlsx.cjs "<caminho>" [maxRows]
const XLSX = require("xlsx");

const file = process.argv[2];
const maxRows = Number(process.argv[3] ?? 25);

if (!file) {
  console.error("Uso: node tools/inspect-xlsx.cjs <arquivo> [maxRows]");
  process.exit(1);
}

const wb = XLSX.readFile(file, { cellDates: true });
console.log("=".repeat(80));
console.log("ARQUIVO:", file);
console.log("ABAS:", wb.SheetNames.join(" | "));
console.log("=".repeat(80));

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const ref = ws["!ref"] || "(vazia)";
  console.log(`\n\n########## ABA: "${name}"  (ref ${ref}) ##########`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  console.log(`linhas totais: ${rows.length}`);
  const slice = rows.slice(0, maxRows);
  slice.forEach((r, i) => {
    const cells = r.map((c) => (c === null ? "" : String(c)));
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.length) console.log(`R${String(i).padStart(3, "0")}: ${cells.join(" | ")}`);
  });
}
