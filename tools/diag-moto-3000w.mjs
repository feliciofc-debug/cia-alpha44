#!/usr/bin/env node
/** Diagnóstico moto 3000W vs 2000W — famílias, passe 1, busca Siscomex. */
import fs from "node:fs";
import {
  parseSupplierFile,
  detectarFamilias,
  montarCandidatosPasse1,
  criarNcmCatalog,
  loadNcmVigente,
  textoClassificacaoIa,
  textoDeteccaoFamilia,
  enriquecerTextoClassificacao,
} from "@cia/pipeline";

const xlsx =
  process.argv[2] ??
  "C:/Users/usuario/Desktop/testes apha44/sim-ARMADILHA-cliente.xlsx";
const catalog = criarNcmCatalog(loadNcmVigente());
const parsed = parseSupplierFile(new Uint8Array(fs.readFileSync(xlsx)));
const linhas = parsed.linhas ?? [];

console.log("Planilha:", xlsx, "| linhas:", linhas.length, "\n");

for (let i = 0; i < Math.min(3, linhas.length); i++) {
  const l = linhas[i];
  const detOrig = detectarFamilias({ descOriginal: l.descOriginal, uso: l.uso });
  const detInput = {
    descOriginal: textoDeteccaoFamilia(l.descOriginal, l.descPt),
    uso: l.uso,
  };
  const cands = montarCandidatosPasse1(catalog, l.descOriginal, null, 25, detInput);
  const textoBusca = enriquecerTextoClassificacao(l.descOriginal, detOrig.familias[0]?.familia ?? null);
  const hits = catalog.buscarPorTexto(textoBusca, undefined, 10).filter((h) => h.score >= 0.12);

  console.log(`=== Item ${i + 1} ===`);
  console.log("descOriginal:", l.descOriginal);
  console.log("material:", l.material ?? "-", "| uso:", l.uso ?? "-", "| ncm planilha:", l.ncm ?? "-");
  console.log("famílias:", detOrig.familias.map((f) => `${f.familia.id}(${f.match})`).join(", "));
  console.log("conflito:", detOrig.conflito, "| aviso:", detOrig.avisoConflito ?? "-");
  console.log(
    "passe1 pos4:",
    cands.map((c) => c.posicao4).join(", "),
  );
  console.log("9617 no passe1?", cands.some((c) => c.posicao4.startsWith("9617")));
  console.log("8711 no passe1?", cands.some((c) => c.posicao4.startsWith("8711")));
  console.log("7615 no passe1?", cands.some((c) => c.posicao4.startsWith("7615")));
  console.log(
    "busca top5:",
    hits.slice(0, 5).map((h) => `${h.ncm}(${h.score.toFixed(2)})`).join(", "),
  );
  console.log("");
}
