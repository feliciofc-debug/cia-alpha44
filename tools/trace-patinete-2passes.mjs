#!/usr/bin/env node
/**
 * Trace 2-passes para ES-T19A-10BLK (patinete completo 500W).
 * Uso na VPS: set -a; source /etc/cia-alpha44/api.env; set +a; node tools/trace-patinete-2passes.mjs
 */
import { detectarFamilia, montarCandidatosPasse1, listarNcm8DaPosicao, resolveNcm, criarNcmCatalog, loadNcmVigenteCache, textoClassificacaoIa } from "@cia/pipeline";
import { getState } from "../apps/api/dist/state.js";
import {
  traduzirDescricoesClassificacao,
} from "../apps/api/dist/llm/classificar-ncm-2passes.js";
import {
  buildPasse1Prompt,
  buildPasse2Prompt,
  parsePasse1Response,
  parsePasse2Response,
  SYSTEM_PASSE1,
  SYSTEM_PASSE2,
} from "../apps/api/dist/llm/prompt-2passes.js";
import { avaliarCompatibilidadeProduto } from "../apps/api/dist/siscomex/compatibilidade-produto.js";

const ITEM = {
  descOriginal: "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W款（黑色） — 1-500",
  material: "高碳钢",
  uso: "骑行",
};

const CONFIANCA_IA_MINIMA = 0.6;

const state = getState();
const catalog = criarNcmCatalog(loadNcmVigenteCache());
const chamarLlm = state.provider.chamarLlm;
if (!chamarLlm) throw new Error("LLM indisponível");

console.log("=== ITEM ===");
console.log(JSON.stringify(ITEM, null, 2));
console.log("provider:", state.provider.nome);

console.log("\n=== PASSE 0 — TRADUÇÃO ===");
const trad = await traduzirDescricoesClassificacao([ITEM], chamarLlm);
const descPt = trad.descricoes[0];
console.log("traducaoIndisponivel:", trad.traducaoIndisponivel);
console.log("descPt:", descPt);
console.log("contém elétrico/scooter/patinete:", /elétric|eletric|scooter|patinete/i.test(descPt ?? ""));

const descIa = textoClassificacaoIa({ descOriginal: ITEM.descOriginal, descPt, material: ITEM.material, uso: ITEM.uso });
console.log("textoClassificacaoIa:", descIa);

const detInput = { descOriginal: descPt, uso: ITEM.uso };
const familia = detectarFamilia(detInput);
console.log("familia detectada:", familia?.id ?? "(nenhuma)", familia?.prefixos ?? []);

console.log("\n=== CANDIDATOS PASSE 1 (montarCandidatosPasse1) ===");
const candidatosP1 = montarCandidatosPasse1(catalog, descPt, familia, undefined, detInput);
console.log("qtd candidatos pos4:", candidatosP1.length);
for (const c of candidatosP1.slice(0, 12)) {
  console.log(`  - ${c.posicao4}: ${(c.descricaoPosicao ?? "").slice(0, 70)}`);
}
const tem8711 = candidatosP1.some((c) => c.posicao4.startsWith("8711"));
console.log("8711 na lista candidatos:", tem8711);

if (!candidatosP1.length) {
  console.log("\nFIM: sem candidatos passe1 → 2-passes aborta aqui (saidaPendente)");
  process.exit(0);
}

console.log("\n=== PASSE 1 — posição 4d (LLM) ===");
const passe1Inputs = [{
  i: 0,
  descricao: descIa,
  ncmInformado: undefined,
  contexto: undefined,
  candidatos: candidatosP1,
}];
const rawP1 = await chamarLlm(SYSTEM_PASSE1, buildPasse1Prompt(passe1Inputs));
const resP1 = parsePasse1Response(rawP1, 1);
const p1 = resP1[0];
console.log("posicao4 escolhida:", p1?.posicao4);
console.log("confianca passe1:", p1?.confianca);
console.log("justificativaRGI:", (p1?.justificativaRGI ?? "").slice(0, 200));
const pos4Valida = candidatosP1.some((c) => c.posicao4 === p1?.posicao4);
console.log("pos4 válida entre candidatos:", pos4Valida);

if (!p1 || !pos4Valida) {
  console.log("\nFIM: passe1 inválido ou pos4 fora da lista → sem passe2");
  process.exit(0);
}

const opcoesP2 = listarNcm8DaPosicao(catalog, p1.posicao4);
console.log("\n=== opções NCM-8 na posição", p1.posicao4, "===", opcoesP2.length, "itens");
for (const o of opcoesP2.slice(0, 8)) {
  console.log(`  - ${o.ncm}: ${(o.descricao ?? "").slice(0, 60)}`);
}

console.log("\n=== PASSE 2 — NCM-8 (LLM) ===");
const passe2Inputs = [{
  i: 0,
  descricao: descIa,
  posicao4: p1.posicao4,
  ncmInformado: undefined,
  opcoes: opcoesP2,
}];
const rawP2 = await chamarLlm(SYSTEM_PASSE2, buildPasse2Prompt(passe2Inputs));
const resP2 = parsePasse2Response(rawP2, 1);
const p2 = resP2[0];
console.log("ncm escolhido:", p2?.ncm);
console.log("confianca passe2:", p2?.confianca);
console.log("descPt passe2:", p2?.descPt);
console.log("justificativaRGI:", (p2?.justificativaRGI ?? "").slice(0, 200));
const ncmValido = p2?.ncm && catalog.existe(p2.ncm) && opcoesP2.some((o) => o.ncm === p2.ncm);
console.log("ncm válido Siscomex:", ncmValido);
console.log("confianca >= 0.6 (BAIXA_CONFIANCA):", (p2?.confianca ?? 0) >= 0.6);
console.log("CONFIANCA_IA_MINIMA 0.6 aceitaria resolveNcm:", (p2?.confianca ?? 0) >= CONFIANCA_IA_MINIMA);

const classifyOut = ncmValido ? {
  descPt: p2.descPt?.trim() || descPt,
  descDuimp: p2.descDuimp,
  ncmCandidatos: [{ ncm: p2.ncm, confianca: p2.confianca, descricaoOficial: catalog.descricao(p2.ncm) }],
  posicaoPasse1: p1.posicao4,
  confiancaPasse1: p1.confianca,
  confiancaPasse2: p2.confianca,
} : { descPt, ncmCandidatos: [] };

console.log("\n=== resolveNcm (pós 2-passes) ===");
const resolved = resolveNcm(catalog, {
  descOriginal: ITEM.descOriginal,
  uso: ITEM.uso,
  descricao: descIa,
  candidatosIa: classifyOut.ncmCandidatos,
});
console.log("ncm final:", resolved.ncm || "(vazio)");
console.log("fonte:", resolved.fonte);
console.log("valido:", resolved.valido);
console.log("avisos:", resolved.avisos);

console.log("\n=== compatibilidade produto × NCM ===");
const ncmCompat = resolved.ncm || p2?.ncm || "00000000";
const { resultado, precisaLlm } = avaliarCompatibilidadeProduto(catalog, {
  descricao: ITEM.descOriginal,
  descricaoFamilia: ITEM.descOriginal,
  material: ITEM.material,
  ncm: ncmCompat,
});
console.log("ncm avaliado:", ncmCompat);
console.log("compatibilidade:", resultado.compatibilidadeProduto);
console.log("camada:", resultado.camada);
console.log("precisaLlm:", precisaLlm);
console.log("motivo:", resultado.motivoCompatibilidade);

console.log("\n=== DIAGNÓSTICO ===");
if (!p2?.ncm || !ncmValido) {
  console.log("→ passe2 não produziu NCM válido (B ou prompt/busca)");
} else if ((p2.confianca ?? 0) < CONFIANCA_IA_MINIMA) {
  console.log(`→ IA escolheu ${p2.ncm} (pos ${p2.ncm.slice(0,4)}) mas conf=${p2.confianca} < 0.6 → (A) THRESHOLD`);
} else if (!p1.posicao4.startsWith("8711")) {
  console.log(`→ pos4=${p1.posicao4} (não 8711) → (B) busca/prompt`);
} else if (p2.ncm.startsWith("871160")) {
  console.log("→ 8711.60 com conf >= 0.6 → deveria classificar OK");
} else {
  console.log(`→ pos 8711 mas NCM ${p2.ncm} (subposição errada?)`);
}
