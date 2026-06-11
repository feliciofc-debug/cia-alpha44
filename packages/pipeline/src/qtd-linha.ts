/** Derivação de quantidade — sem chute silencioso (fatura 92 / caixa compartilhada). */

import { quantidadeTotalLinha, type EntradaPesoLinha } from "./peso-total-linha.js";

export const AVISO_QTD_CAIXA_COMPARTILHADA = "qtd derivada da caixa compartilhada — conferir";

export interface LinhaQtdInput extends EntradaPesoLinha {
  descOriginal?: string;
  /** Alias usado em testes unitários. */
  descricao?: string;
  uso?: string | null;
}

export interface LinhaQtdResolvida extends LinhaQtdInput {
  qtd: number | null;
  avisosQtd: string[];
}

function descLinha(l: LinhaQtdInput): string {
  return l.descOriginal ?? l.descricao ?? "";
}

/** Extrai número de caixa embarque no fim da descrição (ex.: "— 711.0", "— 712.0"). */
export function extrairCaixaCompartilhadaDesc(descricao: string): string | null {
  if (!descricao) return null;
  const segmentos = descricao.split("—").map((s) => s.trim());
  const ultimo = segmentos[segmentos.length - 1] ?? "";
  const m = ultimo.match(/^(\d{3,4})(?:\.\d+)?$/);
  return m ? m[1]! : null;
}

/** Peça/acessório que pode herdar caixa compartilhada (não veículo completo). */
export function ehAcessorioCompartilhado(descricao: string, uso?: string | null): boolean {
  if (uso === "配件") return true;
  const sku = descricao.split("—")[0]?.trim() ?? "";
  return /^ACC-/i.test(sku);
}

function qtdPermitida(entrada: EntradaPesoLinha): number | null {
  return quantidadeTotalLinha(entrada);
}

/**
 * Resolve qtd por linha:
 * (1) coluna qtd total; (2) qtdCaixas × qtdPorCaixa;
 * (3) só qtdPorCaixa + caixa compartilhada já identificada.
 */
export function resolverQuantidadesPlanilha(linhas: LinhaQtdInput[]): LinhaQtdResolvida[] {
  const caixasIdentificadas = new Set<string>();

  for (const l of linhas) {
    const caixa = extrairCaixaCompartilhadaDesc(descLinha(l));
    const qtd = qtdPermitida(l);
    if (caixa && qtd != null && qtd > 0) caixasIdentificadas.add(caixa);
  }

  let caixaCorrente: string | null = null;
  return linhas.map((l) => {
    const desc = descLinha(l);
    const caixaDesc = extrairCaixaCompartilhadaDesc(desc);
    if (caixaDesc) caixaCorrente = caixaDesc;

    const avisosQtd: string[] = [];
    let qtd = qtdPermitida(l);

    if (
      qtd == null &&
      l.qtdPorCaixa != null &&
      l.qtdPorCaixa > 0 &&
      caixaCorrente &&
      caixasIdentificadas.has(caixaCorrente) &&
      ehAcessorioCompartilhado(desc, l.uso)
    ) {
      qtd = l.qtdPorCaixa;
      avisosQtd.push(`${AVISO_QTD_CAIXA_COMPARTILHADA} (${caixaCorrente})`);
    }

    return { ...l, qtd, avisosQtd };
  });
}

/** Aplica qtd resolvida e recalcula FOB total quando há preço unitário. */
export function aplicarQuantidadesLinhas<
  T extends LinhaQtdInput & { fobUnitarioUS?: number | null; fobTotalUS?: number | null },
>(linhas: T[]): Array<T & { qtd: number | null; avisosQtd: string[]; fobTotalUS: number | null }> {
  const resolved = resolverQuantidadesPlanilha(linhas);
  return linhas.map((l, i) => {
    const r = resolved[i]!;
    const qtd = r.qtd;
    let fobTotalUS = l.fobTotalUS ?? null;
    if ((fobTotalUS == null || fobTotalUS <= 0) && l.fobUnitarioUS != null && qtd != null && qtd > 0) {
      fobTotalUS = l.fobUnitarioUS * qtd;
    }
    return {
      ...l,
      qtd,
      avisosQtd: r.avisosQtd,
      fobTotalUS,
    };
  });
}
