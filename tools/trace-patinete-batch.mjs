#!/usr/bin/env node
/** Compare patinete trace: item solo vs batch fatura-92-limpa (13 itens) */
import { readFileSync } from "node:fs";
import { resolveNcm, textoClassificacaoIa } from "@cia/pipeline";
import { getState } from "../apps/api/dist/state.js";
import { executar2PassesComLlm } from "../apps/api/dist/llm/classificar-ncm-2passes.js";
import { avaliarCompatibilidadeProduto } from "../apps/api/dist/siscomex/compatibilidade-produto.js";

const PATINETE = {
  descOriginal: "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W款（黑色） — 1-500",
  material: "高碳钢",
  uso: "骑行",
};

const state = getState();
const chamarLlm = state.provider.chamarLlm;
const catalog = state.ncmCatalog;

console.log("=== SOLO: executar2PassesComLlm (1 item) ===");
const solo = await executar2PassesComLlm(catalog, [PATINETE], chamarLlm);
const s0 = solo[0];
console.log("descPt:", s0?.descPt?.slice(0, 80));
console.log("ncmCandidatos:", JSON.stringify(s0?.ncmCandidatos));
console.log("posicaoPasse1:", s0?.posicaoPasse1, "confP1:", s0?.confiancaPasse1, "confP2:", s0?.confiancaPasse2);
const rs = resolveNcm(catalog, { descOriginal: PATINETE.descOriginal, uso: PATINETE.uso, candidatosIa: s0?.ncmCandidatos ?? [] });
console.log("resolveNcm:", rs.ncm, rs.fonte, rs.valido);

console.log("\n=== BATCH: fatura-92-limpa (13 itens), item 0 ===");
const data = JSON.parse(readFileSync("tools/fatura-92-limpa-classificar.json", "utf8"));
const batchInputs = data.linhas.map((l) => ({
  descOriginal: l.descOriginal,
  material: l.material,
  uso: l.uso,
}));
const batch = await executar2PassesComLlm(catalog, batchInputs, chamarLlm);
const b0 = batch[0];
console.log("descPt:", b0?.descPt?.slice(0, 80));
console.log("ncmCandidatos:", JSON.stringify(b0?.ncmCandidatos));
console.log("posicaoPasse1:", b0?.posicaoPasse1, "confP1:", b0?.confiancaPasse1, "confP2:", b0?.confiancaPasse2);
console.log("classificacaoBaixaConfianca:", b0?.classificacaoBaixaConfianca);
console.log("avisoTraducao:", b0?.avisoTraducao);
const rb = resolveNcm(catalog, { descOriginal: batchInputs[0].descOriginal, uso: batchInputs[0].uso, candidatosIa: b0?.ncmCandidatos ?? [] });
console.log("resolveNcm:", rb.ncm || "(vazio)", rb.fonte, rb.valido, rb.avisos.slice(0, 2));
const compat = avaliarCompatibilidadeProduto(catalog, {
  descricao: batchInputs[0].descOriginal,
  descricaoFamilia: batchInputs[0].descOriginal,
  material: batchInputs[0].material,
  ncm: rb.ncm || "00000000",
});
console.log("compat:", compat.resultado.compatibilidadeProduto, compat.resultado.motivoCompatibilidade.slice(0, 100));

console.log("\n=== BATCH: resumo itens 0-2 ===");
for (let i = 0; i < 3; i++) {
  const o = batch[i];
  const r = resolveNcm(catalog, { descOriginal: batchInputs[i].descOriginal, candidatosIa: o?.ncmCandidatos ?? [] });
  console.log(i, "ncm=", r.ncm || "vazio", "cands=", o?.ncmCandidatos?.length ?? 0, "pos1=", o?.posicaoPasse1);
}
