import { despesasParaEditor } from "./despesas.ts";
import { icmsSaidaParaDestino } from "./icms-uf.ts";
import type { Cotacao, Despesa, ParamsSaida } from "./types.ts";

export type BeneficioFiscal = "ALAGOAS" | "NENHUM";

export interface EditorDraft {
  origem: string;
  destino: string;
  benefFiscal: BeneficioFiscal;
  empresaTrade: string;
  cliente: string;
  markupPct: number;
  despesas: Despesa[];
  paramsAvancados: Pick<
    ParamsSaida,
    "pisSaida" | "cofinsSaida" | "icmsSaida" | "csllSobreMarkup" | "irrfAliq" | "irrfBaseNotaPct"
  >;
  icmsManual: boolean;
}

export function editorFromCotacao(cotacao: Cotacao, clienteOverride?: string): EditorDraft {
  const p = cotacao.params;
  const icmsAuto = icmsSaidaParaDestino(cotacao.destino, cotacao.benefFiscal);
  return {
    origem: cotacao.origem,
    destino: cotacao.destino,
    benefFiscal: (cotacao.benefFiscal === "NENHUM" ? "NENHUM" : "ALAGOAS") as BeneficioFiscal,
    empresaTrade: cotacao.empresaTrade ?? "",
    cliente: clienteOverride ?? cotacao.cliente,
    markupPct: p.markupPct,
    despesas: despesasParaEditor(cotacao.despesas),
    paramsAvancados: {
      pisSaida: p.pisSaida,
      cofinsSaida: p.cofinsSaida,
      icmsSaida: p.icmsSaida,
      csllSobreMarkup: p.csllSobreMarkup,
      irrfAliq: p.irrfAliq,
      irrfBaseNotaPct: p.irrfBaseNotaPct,
    },
    icmsManual: Math.abs(p.icmsSaida - icmsAuto) > 0.0001,
  };
}

export function aplicarEditorNaCotacao(cotacao: Cotacao, draft: EditorDraft): Cotacao {
  const icmsSaida = draft.icmsManual
    ? draft.paramsAvancados.icmsSaida
    : icmsSaidaParaDestino(draft.destino, draft.benefFiscal);

  return {
    ...cotacao,
    origem: draft.origem,
    destino: draft.destino,
    benefFiscal: draft.benefFiscal,
    empresaTrade: draft.empresaTrade,
    cliente: draft.cliente,
    despesas: draft.despesas,
    params: {
      ...cotacao.params,
      markupPct: draft.markupPct,
      pisSaida: draft.paramsAvancados.pisSaida,
      cofinsSaida: draft.paramsAvancados.cofinsSaida,
      icmsSaida,
      csllSobreMarkup: draft.paramsAvancados.csllSobreMarkup,
      irrfAliq: draft.paramsAvancados.irrfAliq,
      irrfBaseNotaPct: draft.paramsAvancados.irrfBaseNotaPct,
    },
  };
}

export function payloadAtualizar(draft: EditorDraft) {
  return {
    origem: draft.origem,
    destino: draft.destino,
    benefFiscal: draft.benefFiscal,
    empresaTrade: draft.empresaTrade,
    cliente: draft.cliente,
    markupPct: draft.markupPct,
    despesas: draft.despesas,
    icmsAuto: !draft.icmsManual,
    params: draft.icmsManual
      ? {
          pisSaida: draft.paramsAvancados.pisSaida,
          cofinsSaida: draft.paramsAvancados.cofinsSaida,
          icmsSaida: draft.paramsAvancados.icmsSaida,
          csllSobreMarkup: draft.paramsAvancados.csllSobreMarkup,
          irrfAliq: draft.paramsAvancados.irrfAliq,
          irrfBaseNotaPct: draft.paramsAvancados.irrfBaseNotaPct,
        }
      : {
          pisSaida: draft.paramsAvancados.pisSaida,
          cofinsSaida: draft.paramsAvancados.cofinsSaida,
          csllSobreMarkup: draft.paramsAvancados.csllSobreMarkup,
          irrfAliq: draft.paramsAvancados.irrfAliq,
          irrfBaseNotaPct: draft.paramsAvancados.irrfBaseNotaPct,
        },
  };
}
