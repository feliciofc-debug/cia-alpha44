import {
  detectarFamilias,
  montarCandidatosPasse1,
  criarNcmCatalog,
  loadNcmVigenteCache,
  textoDeteccaoFamilia,
} from "@cia/pipeline";

const catalog = criarNcmCatalog(loadNcmVigenteCache());
const casos = [
  ["esmerilhadeira", "DE-WZ-2001 Winkelschleifer 1200W", "Esmerilhadeira angular 1200W", "84"],
  ["bomba", "DE-BK-3001 Fahrradpumpe Aluminium", "Bomba de bicicleta alumínio", "84"],
  ["sensor", "DE-SN-4001 Näherungssensor M18", "Sensor industrial proximidade M18", "85"],
  ["jogo chaves", "Schraubenschlüssel-Set 12-teilig", "Jogo de chaves de boca 12 peças", "82"],
];

for (const [id, orig, pt, capEsp] of casos) {
  const texto = textoDeteccaoFamilia(orig, pt);
  const det = detectarFamilias({ descOriginal: texto });
  const fam = det.familias[0]?.familia;
  const p1 = montarCandidatosPasse1(catalog, pt, fam ?? null, 5, { descOriginal: texto });
  const cap = p1[0]?.posicao4.slice(0, 2) ?? "?";
  const ok = cap === capEsp ? "OK" : "FAIL";
  console.log(
    `${ok} ${id}: fam=${fam?.id ?? "none"} prefixos=${fam?.prefixos.join(",") ?? "-"} P1[0]=${p1[0]?.posicao4 ?? "?"} cap=${cap} esp=${capEsp}`,
  );
}
