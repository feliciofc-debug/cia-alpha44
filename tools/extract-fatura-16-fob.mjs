import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseSupplierFile } from "../packages/pipeline/dist/parser.js";

const desktop = path.join(os.homedir(), "Desktop");
const nome = fs.readdirSync(desktop).find(
  (f) => f.endsWith(".xlsx") && f.startsWith("16 -") && !f.includes("PLANILHA") && !f.includes("(1)"),
);
if (!nome) {
  console.error("Planilha fatura 16 não encontrada no Desktop");
  process.exit(1);
}

const parsed = await parseSupplierFile(new Uint8Array(fs.readFileSync(path.join(desktop, nome))));
const FOB_KG = 2.109588;
const out = {
  fonte: nome,
  fobKgPlanilha: FOB_KG,
  itens: parsed.linhas.map((l) => ({
    descricao: l.descOriginal,
    ncm: l.ncm,
    pesoBrutoKg: l.pesoBrutoKg,
    pesoLiqKg: l.pesoLiqKg,
    fobTotalUS: l.fobTotalUS,
    fobKgPlanilha: FOB_KG,
  })),
};
const dest = path.join("packages/pipeline/test/fixtures/fatura-16-fob.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.itens.length} items to ${dest}`);
