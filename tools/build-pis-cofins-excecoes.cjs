/**
 * Gera tools/data-fontes/pis-cofins-excecoes.json a partir de fontes oficiais curadas.
 * §3 Lei 10.865 (prefixos explícitos) + autopeças 8 dígitos da lista MDIC.
 */

const { writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const XLSX = require("xlsx");

const OUT = join(__dirname, "data-fontes", "pis-cofins-excecoes.json");
const AUTOPECAS = join(__dirname, "data-fontes", "autopecas-mdic.xlsx");

/** Lei 10.865/2004, art. 8º, §3 — alíquotas após Lei 13.137/2015. */
const SEC3_PREFIXOS = [
  "8429",
  "84324000",
  "84328000",
  "843320",
  "84333000",
  "84334000",
  "84335",
  "8701",
  "8702",
  "8703",
  "8704",
  "8705",
  "8706",
];

function normNcm8(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 8 ? d : null;
}

/**
 * @returns {Array<{ ncmPrefixo: string, condicional: boolean }>}
 */
function extrairAutopecas(filePath) {
  if (!existsSync(filePath)) {
    console.warn("AVISO: autopecas-mdic.xlsx ausente — só §3 será incluído");
    return [];
  }
  const wb = XLSX.readFile(filePath);
  /** @type {Map<string, { comEx: number, semEx: number }>} */
  const byNcm = new Map();

  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const ncm = normNcm8(row[0]);
      if (!ncm) continue;
      const ex = String(row[1] ?? "").trim();
      if (!byNcm.has(ncm)) byNcm.set(ncm, { comEx: 0, semEx: 0 });
      const g = byNcm.get(ncm);
      if (ex) g.comEx++;
      else g.semEx++;
    }
  }

  return [...byNcm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ncmPrefixo, g]) => ({
      ncmPrefixo,
      /** Ex no anexo MDIC → majoração só se produto for de uso automotivo. */
      condicional: g.comEx > 0,
    }));
}

function main() {
  const excecoes = SEC3_PREFIXOS.map((ncmPrefixo) => ({
    ncmPrefixo,
    pis: 0.0262,
    cofins: 0.1257,
    condicional: false,
    fundamentoLegal: "Lei 10.865/2004, art. 8º, §3 (Lei 13.137/2015)",
  }));

  let condicionais = 0;
  let incondicionais = excecoes.length;

  for (const { ncmPrefixo, condicional } of extrairAutopecas(AUTOPECAS)) {
    excecoes.push({
      ncmPrefixo,
      pis: 0.0312,
      cofins: 0.1437,
      condicional,
      fundamentoLegal:
        "Lei 10.865/2004, art. 8º, §9-A; autopeça — Lista MDIC Regime Autopeças (Lei 10.485/2002)",
    });
    if (condicional) condicionais++;
    else incondicionais++;
  }

  const out = {
    fonte: "Curado: Lei 10.865/2004 §3 + Lista Autopeças MDIC (Regime Autopeças Res. Gecex 284/2022)",
    pisPadrao: 0.021,
    cofinsPadrao: 0.0965,
    fundamentoPisCofinsPadrao: "Lei 10.865/2004, art. 8º",
    excecoes,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`OK — ${excecoes.length} exceções PIS/COFINS → ${OUT}`);
  console.log(`  Incondicionais: ${incondicionais} | Condicionais (Ex Lei 10.485): ${condicionais}`);
}

main();
