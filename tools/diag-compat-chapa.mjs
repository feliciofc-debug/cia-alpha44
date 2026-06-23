#!/usr/bin/env node
import { criarNcmCatalog, loadNcmVigente, detectarFamilia, detectarFamilias } from "@cia/pipeline";
import { avaliarCompatibilidadeProduto } from "../apps/api/dist/siscomex/compatibilidade-produto.js";

const catalog = criarNcmCatalog(loadNcmVigente());
const cases = [
  ["CHP-VAGA-5MM chapa aço 5mm espessura variável", "72085200"],
  ["Chapa de aço 5 mm — obra de aço", "72085200"],
  ["Stahlblech 5mm warmgewalzt", "72085200"],
  ["CHP-VAGA-5MM Stahlblech 5mm", "72085200"],
  ["CHP-VAGA-5MM chapa aço 5mm", "73269090"],
];

for (const [desc, ncm] of cases) {
  const fam = detectarFamilia(desc);
  const fams = detectarFamilias(desc).familias.map((f) => f.familia.id);
  const r = avaliarCompatibilidadeProduto(catalog, {
    descricao: desc,
    descricaoFamilia: desc,
    ncm,
  });
  console.log(`\n${desc.slice(0, 55)} + ${ncm}`);
  console.log(`  familia: ${fam?.id ?? "null"} [${fams.join(", ")}]`);
  console.log(`  compat: ${r.resultado.compatibilidadeProduto}`);
  console.log(`  motivo: ${r.resultado.motivoCompatibilidade.slice(0, 150)}`);
}
