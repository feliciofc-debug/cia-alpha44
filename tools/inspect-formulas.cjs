// Dumpa as FÓRMULAS (cell.f) e valores (cell.v) de cada célula não-vazia de uma aba.
// Uso: node tools/inspect-formulas.cjs "<arquivo>" "<aba>"
const XLSX = require("xlsx");

const file = process.argv[2];
const sheetName = process.argv[3];

const wb = XLSX.readFile(file, { cellDates: true, cellFormula: true });
const names = sheetName ? [sheetName] : wb.SheetNames;

for (const name of names) {
  const ws = wb.Sheets[name];
  if (!ws) {
    console.log(`(aba "${name}" não encontrada)`);
    continue;
  }
  const ref = ws["!ref"];
  console.log(`\n########## ABA "${name}" (ref ${ref}) ##########`);
  const range = XLSX.utils.decode_range(ref);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      const v = cell.v;
      if (cell.f) {
        console.log(`${addr} = ${cell.f}    [v=${v}]`);
      } else if (v !== null && v !== undefined && String(v).trim() !== "") {
        console.log(`${addr} : ${v}`);
      }
    }
  }
}
