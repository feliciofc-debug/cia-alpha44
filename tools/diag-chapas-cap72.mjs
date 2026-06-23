import {
  detectarFamilia,
  montarCandidatosPasse1,
  criarNcmCatalog,
  loadNcmVigenteCache,
  ncmCoerenteComFamilia,
} from "@cia/pipeline";

const catalog = criarNcmCatalog(loadNcmVigenteCache());

const CHAPAS = [
  "CHP-LF-1MM chapa laminada aço carbono 1mm",
  "CHP-LF-3MM chapa laminada frio 3mm",
  "CHP-LQ-6MM chapa laminada quente 6mm",
  "CHP-GALV-2MM chapa galvanizada 2mm",
  "CHP-INOX-4MM chapa aço inox 4mm",
];

const CONTROLES = [
  ["Garrafa térmica inox 1L", "96", "recipientes_isotermicos"],
  ["Jogo de panelas aço inox 5 peças", "73", "cozinha_utensilios"],
  ["Patinete elétrico 350W", "87", "veiculo_leve_eletrico"],
  ["Garrafa térmica vidro 750ml", "96", "recipientes_isotermicos"],
];

console.log("=== ANTES (esperado): chapas iam 7323 | DEPOIS: cap 72 ===\n");
for (const desc of CHAPAS) {
  const fam = detectarFamilia(desc);
  const p1 = montarCandidatosPasse1(catalog, desc, fam, 5, { descOriginal: desc });
  const cap = p1[0]?.posicao4.slice(0, 2) ?? "?";
  const iaOk = fam ? ncmCoerenteComFamilia("72269200", fam) : false;
  console.log(
    `${cap === "72" ? "OK" : "FAIL"} cap=${cap} fam=${fam?.id ?? "?"} ia7226=${iaOk ? "aceita" : "rejeita"} | ${desc.slice(0, 45)}`,
  );
}

console.log("\n=== CONTROLES intactos ===\n");
for (const [desc, capEsp, famEsp] of CONTROLES) {
  const fam = detectarFamilia(desc);
  const p1 = montarCandidatosPasse1(catalog, desc, fam, 5, { descOriginal: desc });
  const cap = p1[0]?.posicao4.slice(0, 2) ?? "?";
  const ok = cap === capEsp && fam?.id === famEsp;
  console.log(`${ok ? "OK" : "FAIL"} cap=${cap} esp=${capEsp} fam=${fam?.id} | ${desc}`);
}
