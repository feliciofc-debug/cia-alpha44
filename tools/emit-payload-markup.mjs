/** Emite o JSON exato que payloadAtualizar() mandaria no PATCH. */
import { editorFromCotacao, payloadAtualizar } from "../apps/web/src/lib/editor-cotacao.ts";

const cotacaoBase = {
  origem: "AL",
  destino: "SP",
  ufEmpresa: "AL",
  regimeIcms: "AL_DIFERIDO",
  benefFiscal: "ALAGOAS",
  empresaTrade: "Alpha 44",
  cliente: "Teste markup",
  cambio: 5.5,
  freteTotalUS: 3500,
  siscomex: 214.5,
  adicionaisVaUS: 0,
  reducaoBaseUS: 0,
  qtdContainers: 1,
  despesas: [{ nome: "AFRMM", valorBRL: 1000, entraBaseSaida: true, entraBaseNota: true }],
  icmsSaidaManualFlag: false,
  params: {
    markupPct: 0.06,
    pisSaida: 0.0165,
    cofinsSaida: 0.076,
    icmsSaida: 0.04,
    csllSobreMarkup: 0.09,
    irrfAliq: 0.25,
    irrfBaseNotaPct: 0.027,
    icmsEntrada: 0,
    ipiTetoAliqMedia: 0.15,
  },
  itens: [],
};

const draft = editorFromCotacao(cotacaoBase);
draft.markupPct = 0.08; // slider movido para 8%
const payload = payloadAtualizar(draft);
console.log("=== PATCH payload (slider 8% = fração 0.08) ===");
console.log(JSON.stringify(payload, null, 2));
console.log("\nmarkupPct no payload:", payload.markupPct, typeof payload.markupPct);

const draftBug = { ...draft, markupPct: 8 };
const payloadBug = payloadAtualizar(draftBug);
console.log("\n=== Se slider guardasse percentual 8 (bug hipótese) ===");
console.log("markupPct:", payloadBug.markupPct);
