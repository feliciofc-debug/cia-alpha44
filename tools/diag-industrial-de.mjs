#!/usr/bin/env node
/**
 * Diagnóstico classificação — vocabulário industrial DE (stress test).
 * Pipeline-only (família + busca + candidatos P1) + mock tradução + busca "esmeril".
 */
import {
  candidatosSiscomexPorDescricao,
  criarNcmCatalog,
  detectarFamilias,
  enriquecerTextoClassificacao,
  loadNcmVigenteCache,
  montarCandidatosPasse1,
  resolveNcm,
  textoClassificacaoIa,
  textoDeteccaoFamilia,
} from "@cia/pipeline";
import { traduzirDescricaoClassificacaoMock } from "../apps/api/src/llm/traducao-classificacao-mock.ts";

const catalog = criarNcmCatalog(loadNcmVigenteCache());

/** Itens do stress test industrial (DE + PT pós-tradução esperada). */
const ITENS = [
  {
    id: "esmerilhadeira",
    descOriginal: "DE-WZ-2001 — Winkelschleifer 1200W mit Schutzhaube und Zusatzhandgriff",
    descPtMock: "Esmerilhadeira angular 1200W com capa protetora e empunhadura auxiliar",
    material: "Aço, plástico",
    ncmErrado: "25132000",
    ncmEsperado: "846729",
  },
  {
    id: "bomba_bicicleta",
    descOriginal: "DE-BK-3001 — Fahrradpumpe Aluminium mit Manometer, Handpumpe",
    descPtMock: "Bomba de bicicleta alumínio com manômetro, bomba manual",
    material: "Alumínio",
    ncmErrado: "76061230",
    ncmEsperado: "841420",
  },
  {
    id: "sensor_24v",
    descOriginal: "DE-SN-4001 — Industrie-Sensor 24V DC Näherungssensor M18",
    descPtMock: "Sensor industrial 24V DC sensor de proximidade M18",
    material: "Plástico, metal",
    ncmErrado: "00000000",
    ncmEsperado: "8536/9026",
  },
  {
    id: "jogo_chaves",
    descOriginal: "DE-WRK-SCHR — Schraubenschlüssel-Set 12-teilig metrisch, Chrom-Vanadium",
    descPtMock: "Jogo de chaves de boca 12 peças métricas cromo-vanádio",
    material: "Cromo-vanádio",
    ncmErrado: "00000000",
    ncmEsperado: "8204",
  },
];

/** Controle — corretos no stress test */
const CONTROLES = [
  { desc: "DE-FL-5001 — Ölfilter für Industriemotor", descPt: "Filtro de óleo motor industrial", cap: "84" },
  { desc: "DE-EL-6001 — Kupferkabel 3x2,5mm² isoliert", descPt: "Cabo de cobre 3x2,5mm² isolado", cap: "85" },
  { desc: "DE-MD-7001 — Blutdruckmessgerät digital", descPt: "Medidor pressão arterial digital", cap: "90" },
];

function secao(titulo) {
  console.log(`\n${"=".repeat(72)}\n${titulo}\n${"=".repeat(72)}`);
}

function fmtFamilias(d) {
  if (!d.familias.length) return "(nenhuma)";
  return d.familias.map((f) => `${f.familia.id} [${f.match}]`).join(", ");
}

function traceItem(it) {
  const mockPt = traduzirDescricaoClassificacaoMock(it.descOriginal);
  const descPt = mockPt !== it.descOriginal.trim() ? mockPt : it.descPtMock;
  const textoDet = textoDeteccaoFamilia(it.descOriginal, descPt);

  secao(`${it.id.toUpperCase()} — ${it.descOriginal.slice(0, 60)}…`);

  console.log("descPt (mock LLM):", descPt);
  console.log("mock melhorou tradução:", mockPt !== it.descOriginal.trim());

  const detOrig = detectarFamilias({ descOriginal: it.descOriginal });
  const detPt = detectarFamilias({ descOriginal: textoDet });
  console.log("\n--- Família (só original) ---");
  console.log("  ", fmtFamilias(detOrig), detOrig.conflito ? "| CONFLITO" : "");
  console.log("--- Família (original + descPt) ---");
  console.log("  ", fmtFamilias(detPt), detPt.conflito ? "| CONFLITO" : "");

  const familia = detPt.conflito ? null : detPt.familias[0]?.familia ?? null;
  const detInput = { descOriginal: textoDet };

  const candidatosP1 = montarCandidatosPasse1(catalog, descPt, familia, 25, detInput);
  console.log("\n--- Candidatos Passe 1 (posição 4d) ---");
  console.log("  qtd:", candidatosP1.length);
  for (const c of candidatosP1.slice(0, 10)) {
    const mark =
      c.posicao4.startsWith(it.ncmEsperado.slice(0, 2)) || c.posicao4.startsWith(it.ncmEsperado.slice(0, 4))
        ? " ◀ esperado"
        : c.posicao4.startsWith((it.ncmErrado || "").slice(0, 4))
          ? " ◀ ERRADO"
          : "";
    console.log(`  ${c.posicao4}: ${(c.descricaoPosicao ?? "").slice(0, 65)}${mark}`);
  }
  const temEsperado = candidatosP1.some((c) => c.posicao4.startsWith(it.ncmEsperado.replace(/\/.*/, "").slice(0, 4)));
  const temErrado = it.ncmErrado && candidatosP1.some((c) => c.posicao4.startsWith(it.ncmErrado.slice(0, 4)));
  console.log(`  posição esperada (${it.ncmEsperado}) na lista P1:`, temEsperado);
  if (it.ncmErrado !== "00000000") console.log(`  posição errada (${it.ncmErrado.slice(0, 4)}) na lista P1:`, temErrado);

  const textoIa = textoClassificacaoIa({
    descOriginal: it.descOriginal,
    descPt,
    material: it.material,
  });
  console.log("\n--- Busca Siscomex (fallback, sem IA) ---");
  const textoEnriquecido = enriquecerTextoClassificacao(textoDet, familia);
  console.log("  texto busca:", textoEnriquecido.slice(0, 100));

  const hitsLivre = catalog.buscarPorTexto(textoDet, undefined, 8);
  console.log("  top hits (sem capítulo):");
  for (const h of hitsLivre.slice(0, 6)) {
    console.log(`    ${h.ncm} score=${h.score.toFixed(3)} | ${h.descricao.slice(0, 55)}`);
  }

  if (familia) {
    const hitsFam = candidatosSiscomexPorDescricao(catalog, textoDet, familia, 5);
    console.log("  candidatos com família", familia.id + ":");
    for (const h of hitsFam) console.log(`    ${h.ncm} conf=${h.confianca} | ${(h.descricaoOficial ?? "").slice(0, 55)}`);
  }

  // Teste isolado: palavra "esmeril" vs "esmerilhadeira"
  if (it.id === "esmerilhadeira") {
    console.log("\n--- Desambiguação esmeril vs esmerilhadeira ---");
    for (const termo of ["esmeril", "esmerilhadeira", "winkelschleifer", "angle grinder", "8467"]) {
      const hits = catalog.buscarPorTexto(termo, undefined, 5);
      console.log(`  busca "${termo}":`, hits.slice(0, 3).map((h) => `${h.ncm}(${h.score.toFixed(2)})`).join(", ") || "(vazio)");
    }
    const hits2513 = catalog.buscarPorTexto("esmeril", "2513", 3);
    const hits8467 = catalog.buscarPorTexto("esmerilhadeira ferramenta eletrica", "8467", 3);
    console.log("  esmeril cap 2513:", hits2513.map((h) => h.ncm).join(", ") || "(vazio)");
    console.log("  esmerilhadeira cap 8467:", hits8467.map((h) => h.ncm).join(", ") || "(vazio)");
  }

  // resolve sem candidatos IA → puro fallback
  const resolved = resolveNcm(catalog, {
    descOriginal: it.descOriginal,
    descPt,
    descricao: textoIa,
    candidatosIa: [],
  });
  console.log("\n--- resolveNcm (sem IA, só fallback) ---");
  console.log("  ncm:", resolved.ncm || "(vazio/pendente)");
  console.log("  fonte:", resolved.fonte);
  console.log("  avisos:", resolved.avisos.slice(0, 3).join(" | ") || "(nenhum)");

  // Simular IA devolvendo o NCM errado observado
  if (it.ncmErrado && it.ncmErrado !== "00000000") {
    const resolvedIaErrada = resolveNcm(catalog, {
      descOriginal: it.descOriginal,
      descPt,
      descricao: textoIa,
      candidatosIa: [{ ncm: it.ncmErrado, confianca: 0.85, descricaoOficial: catalog.descricao(it.ncmErrado) }],
    });
    console.log("\n--- resolveNcm (simula IA retornando NCM errado observado) ---");
    console.log("  ncm:", resolvedIaErrada.ncm);
    console.log("  fonte:", resolvedIaErrada.fonte);
    console.log("  avisos:", resolvedIaErrada.avisos.join(" | "));
  }

  let diagnostico = "";
  if (!detPt.familias.length) diagnostico = "FALHA RAIZ: família vazia → busca livre / material domina";
  else if (detPt.conflito) diagnostico = "FALHA: conflito de famílias → guard-rail desligado";
  else if (!temEsperado && candidatosP1.length === 0) diagnostico = "FALHA: zero candidatos P1 → 2-passes aborta (00000000)";
  else if (!temEsperado) diagnostico = "FALHA: família/busca não ancora capítulo correto no P1";
  else if (temErrado && !temEsperado) diagnostico = "FALHA: P1 inclui capítulo errado, não o esperado";
  else diagnostico = "Capítulo esperado presente no P1 — erro provável no passe LLM ou confiança";
  console.log("\n>>> DIAGNÓSTICO:", diagnostico);
}

secao("CATÁLOGO — famílias e regex (resumo)");
import { FAMILIAS_PRODUTO } from "@cia/pipeline";
for (const f of FAMILIAS_PRODUTO) {
  console.log(`${f.id.padEnd(22)} cap=${f.prefixos.join(",")} | ${String(f.re).slice(0, 90)}…`);
}
console.log(`\nTotal: ${FAMILIAS_PRODUTO.length} famílias`);

secao("CONTROLES (devem continuar OK)");
for (const c of CONTROLES) {
  const det = detectarFamilias({ descOriginal: textoDeteccaoFamilia(c.desc, c.descPt) });
  const fam = det.familias.map((x) => x.familia.id).join("+") || "(nenhuma)";
  const p1 = montarCandidatosPasse1(catalog, c.descPt, det.familias[0]?.familia ?? null, 10, {
    descOriginal: c.descPt,
  });
  const cap = p1[0]?.posicao4.slice(0, 2) ?? "?";
  console.log(`${c.desc.slice(0, 45)}… fam=${fam} P1[0]=${p1[0]?.posicao4 ?? "?"} cap=${cap} ${cap === c.cap ? "OK" : "FAIL"}`);
}

for (const it of ITENS) traceItem(it);
