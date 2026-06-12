/** Derivação de quantidade — sem chute silencioso (fatura 92 / caixa compartilhada). */

import { quantidadeTotalLinha, type EntradaPesoLinha } from "./peso-total-linha.js";

export const AVISO_QTD_CAIXA_COMPARTILHADA = "qtd derivada da caixa compartilhada — conferir";

export interface LinhaQtdInput extends EntradaPesoLinha {
  descOriginal?: string;
  /** Alias usado em testes unitários. */
  descricao?: string;
  uso?: string | null;
  /** Caixa compartilhada declarada na planilha (ex.: Sammelkarton 999). */
  sammelkarton?: string | null;
  fobUnitarioUS?: number | null;
  precoUnitario?: number | null;
}

function temPrecoUnitario(l: LinhaQtdInput): boolean {
  return l.precoUnitario != null || l.fobUnitarioUS != null;
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

/** Extrai VPE (Verpackungseinheit) da descrição — ex.: "VPE 100". */
export function extrairVpeQuantidade(descricao: string): number | null {
  const m = descricao.match(/\bVPE\s*(\d+)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Peça/acessório que pode herdar caixa compartilhada (não veículo completo). */
export function ehAcessorioCompartilhado(descricao: string, uso?: string | null): boolean {
  if (uso === "配件") return true;
  if (/ersatzteil|befestigung|zubeh[oö]r|spare|accessory|heimetextil/i.test(uso ?? "")) return true;
  const sku = descricao.split("—")[0]?.trim() ?? "";
  if (/^ACC-/i.test(sku)) return true;
  if (/stoßdämpfer|schrauben|sechskant|ersatzteil/i.test(descricao)) return true;
  return false;
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
  const sammelGlobal = linhas.find((l) => l.sammelkarton)?.sammelkarton ?? null;
  if (sammelGlobal) caixasIdentificadas.add(sammelGlobal);

  for (const l of linhas) {
    const caixa = extrairCaixaCompartilhadaDesc(descLinha(l));
    const qtd = qtdPermitida(l);
    if (caixa && qtd != null && qtd > 0) caixasIdentificadas.add(caixa);
  }

  let caixaCorrente: string | null = sammelGlobal;
  return linhas.map((l) => {
    const desc = descLinha(l);
    const caixaDesc = extrairCaixaCompartilhadaDesc(desc);
    if (caixaDesc) caixaCorrente = caixaDesc;
    if (!caixaCorrente && l.sammelkarton) caixaCorrente = l.sammelkarton;

    const avisosQtd: string[] = [];
    let qtd = qtdPermitida(l);

    if (qtd == null) {
      const vpe = extrairVpeQuantidade(desc);
      if (vpe != null) {
        qtd = vpe;
        avisosQtd.push(`qtd derivada de VPE ${vpe} na descrição — conferir`);
      }
    }

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

    if (
      qtd == null &&
      (l.qtdCaixas === 0 || l.qtdCaixas == null) &&
      temPrecoUnitario(l) &&
      ehAcessorioCompartilhado(desc, l.uso) &&
      caixaCorrente &&
      caixasIdentificadas.has(caixaCorrente)
    ) {
      qtd = 1;
      avisosQtd.push(`qtd assumida 1 — item em Sammelkarton ${caixaCorrente}, conferir`);
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
