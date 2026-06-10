/**
 * Preços de custo FOB unitário (USD) — regras operacionais INNOVE/Paulo.
 * Aplica-se por unidade: FOB total = preço unitário × quantidade.
 */

import type { LinhaCrua } from "./linha.js";

/** FOB unitário padrão — moto elétrica. */
export const PRECO_CUSTO_MOTO_USD = 300;
/** FOB unitário padrão — patinete elétrico. */
export const PRECO_CUSTO_PATINETE_USD = 109;

export type TipoPrecoCusto = "moto_eletrica" | "patinete_eletrico";

const RE_MOTO =
  /moto\s*el[eé]tr|motocicleta\s*el[eé]tr|electric\s*motorcycle|e-?motorcycle|motorcycle|ciclomotor|摩托车/i;

const RE_PATINETE =
  /patinete|kick\s*scooter|e-?scooter|scooter\s*el[eé]tr|hoverboard|self\s*balance|电动滑板|滑板车|平衡车/i;

function ncm8(ncm: string | null | undefined): string {
  return (ncm ?? "").replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

export function precoCustoUnitarioUSD(tipo: TipoPrecoCusto): number {
  return tipo === "moto_eletrica" ? PRECO_CUSTO_MOTO_USD : PRECO_CUSTO_PATINETE_USD;
}

/** Detecta se a linha é moto ou patinete elétrico (descrição + NCM). */
export function detectarPrecoCusto(descricao: string, ncm?: string | null): TipoPrecoCusto | null {
  const d = descricao.trim();
  if (!d) return null;

  if (RE_MOTO.test(d) && !/patinete|kick\s*scooter/i.test(d)) return "moto_eletrica";
  if (RE_PATINETE.test(d) && !RE_MOTO.test(d)) return "patinete_eletrico";

  const key = ncm8(ncm);
  if (key.startsWith("8711")) return "moto_eletrica";
  if (key.startsWith("9503") && /scooter|patinete|hover/i.test(d)) return "patinete_eletrico";

  return null;
}

/** Aplica preço de custo unitário quando o produto for moto ou patinete elétrico. */
export function aplicarPrecoCustoLinha(l: LinhaCrua): LinhaCrua {
  const tipo = detectarPrecoCusto(l.descOriginal, l.ncm);
  if (!tipo) return l;

  const unit = precoCustoUnitarioUSD(tipo);
  const qtd = l.qtd != null && l.qtd > 0 ? l.qtd : 1;

  return {
    ...l,
    qtd,
    fobUnitarioUS: unit,
    fobTotalUS: unit * qtd,
  };
}

export function aplicarPrecoCustoLinhas(linhas: LinhaCrua[]): LinhaCrua[] {
  return linhas.map(aplicarPrecoCustoLinha);
}

export function rotuloPrecoCusto(tipo: TipoPrecoCusto): string {
  return tipo === "moto_eletrica" ? "Moto elétrica" : "Patinete elétrico";
}
