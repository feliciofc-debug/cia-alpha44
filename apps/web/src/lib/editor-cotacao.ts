import { despesasParaEditor, inferirQtdContainers, outrasDespesasBaseParaContainers, DEFAULT_FRETE_US, DEFAULT_SISCOMEX_BRL } from "./despesas.ts";
import { icmsSaidaParaDestino } from "./icms-uf.ts";
import type { Cotacao, Despesa, ParamsSaida } from "./types.ts";

export type BeneficioFiscal = "ALAGOAS" | "NENHUM";

export interface EditorDraft {
  origem: string;
  destino: string;
  benefFiscal: BeneficioFiscal;
  empresaTrade: string;
  cliente: string;
  cambio: number;
  freteTotalUS: number;
  siscomex: number;
  adicionaisVaUS: number;
  reducaoBaseUS: number;
  markupPct: number;
  qtdContainers: number;
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
    cambio: cotacao.cambio,
    freteTotalUS: cotacao.freteTotalUS ?? DEFAULT_FRETE_US,
    siscomex: cotacao.siscomex ?? DEFAULT_SISCOMEX_BRL,
    adicionaisVaUS: cotacao.adicionaisVaUS ?? 0,
    reducaoBaseUS: cotacao.reducaoBaseUS ?? 0,
    markupPct: p.markupPct,
    qtdContainers: cotacao.qtdContainers ?? inferirQtdContainers(cotacao.despesas),
    despesas: despesasParaEditor(cotacao.despesas, cotacao.qtdContainers ?? inferirQtdContainers(cotacao.despesas)),
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
    cambio: draft.cambio,
    freteTotalUS: draft.freteTotalUS,
    siscomex: draft.siscomex,
    adicionaisVaUS: draft.adicionaisVaUS,
    reducaoBaseUS: draft.reducaoBaseUS,
    qtdContainers: draft.qtdContainers,
    despesas: draft.despesas,
    outrasDespesasBaseBRL: outrasDespesasBaseParaContainers(draft.qtdContainers),
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
    cambio: draft.cambio,
    freteTotalUS: draft.freteTotalUS,
    siscomex: draft.siscomex,
    adicionaisVaUS: draft.adicionaisVaUS,
    reducaoBaseUS: draft.reducaoBaseUS,
    markupPct: draft.markupPct,
    qtdContainers: draft.qtdContainers,
    despesas: draft.despesas,
    outrasDespesasBaseBRL: outrasDespesasBaseParaContainers(draft.qtdContainers),
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
