/**
 * Preços de custo FOB unitário (USD) — regras operacionais INNOVE/Paulo.
 * Aplica-se somente a produto completo (moto/patinete), nunca a peças/acessórios.
 */

import type { LinhaCrua } from "./linha.js";

/** FOB unitário padrão — moto elétrica. */
export const PRECO_CUSTO_MOTO_USD = 300;
/** FOB unitário padrão — patinete elétrico. */
export const PRECO_CUSTO_PATINETE_USD = 109;

export type TipoPrecoCusto = "moto_eletrica" | "patinete_eletrico";

/** Peso unitário mínimo (kg) para considerar produto completo vs peça. */
export const PESO_MIN_VEICULO_KG = 5;

export interface DetectarPrecoCustoInput {
  descOriginal: string;
  ncm?: string | null;
  uso?: string | null;
  pesoLiqKg?: number | null;
  pesoBrutoKg?: number | null;
  qtd?: number | null;
}

const RE_MOTO =
  /moto\s*el[eé]tr|motocicleta\s*el[eé]tr|electric\s*motorcycle|e-?motorcycle|motorcycle|ciclomotor|摩托车/i;

const RE_PATINETE =
  /patinete|kick\s*scooter|e-?scooter|scooter\s*el[eé]tr|hoverboard|self\s*balance|电动滑板|滑板车|平衡车/i;

/** Uso / descrição indica peça ou acessório — preço-custo não se aplica. */
export const RE_USO_PECA =
  /配件|acess[oó]rio|accessories|spare\s*part|\bspare\b|\bparte\b|pe[cç]as?\b/i;

function ncm8(ncm: string | null | undefined): string {
  return (ncm ?? "").replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

export function isUsoPeca(uso?: string | null): boolean {
  return RE_USO_PECA.test((uso ?? "").trim());
}

function pesoUnitarioKg(input: DetectarPrecoCustoInput): number | null {
  const qtd = input.qtd != null && input.qtd > 0 ? input.qtd : 1;
  const peso = input.pesoLiqKg ?? input.pesoBrutoKg;
  if (peso == null || peso <= 0) return null;
  return peso / qtd;
}

/** Sanity check: veículo completo pesa bem mais que peça avulsa. */
export function pesoCompativelVeiculo(input: DetectarPrecoCustoInput): boolean {
  const pu = pesoUnitarioKg(input);
  if (pu == null) return true;
  return pu > PESO_MIN_VEICULO_KG;
}

function tipoPorDescOriginal(desc: string): TipoPrecoCusto | null {
  if (RE_MOTO.test(desc) && !/patinete|kick\s*scooter|滑板车/i.test(desc)) return "moto_eletrica";
  if (RE_PATINETE.test(desc) && !RE_MOTO.test(desc)) return "patinete_eletrico";
  if (/patinete/i.test(desc) || (/scooter/i.test(desc) && /el[eé]tr/i.test(desc))) {
    return "patinete_eletrico";
  }
  return null;
}

function tipoPorNcm(ncm: string | null | undefined, desc: string): TipoPrecoCusto | null {
  const key = ncm8(ncm);
  if (key.startsWith("871160")) return "patinete_eletrico";
  if (key.startsWith("8711")) return "moto_eletrica";
  if (key.startsWith("9503") && RE_PATINETE.test(desc)) return "patinete_eletrico";
  return null;
}

export function precoCustoUnitarioUSD(tipo: TipoPrecoCusto): number {
  return tipo === "moto_eletrica" ? PRECO_CUSTO_MOTO_USD : PRECO_CUSTO_PATINETE_USD;
}

/**
 * Detecta moto ou patinete elétrico completo.
 * Match de veículo só em descOriginal; descPt expandida pela IA não entra.
 */
export function detectarPrecoCusto(
  input: DetectarPrecoCustoInput | string,
  ncm?: string | null,
): TipoPrecoCusto | null {
  const ctx: DetectarPrecoCustoInput =
    typeof input === "string" ? { descOriginal: input, ncm } : { ...input, ncm: input.ncm ?? ncm };

  if (isUsoPeca(ctx.uso)) return null;

  const desc = ctx.descOriginal.trim();
  if (!desc) return null;

  const tipo = tipoPorDescOriginal(desc) ?? tipoPorNcm(ctx.ncm, desc);
  if (!tipo) return null;
  if (!pesoCompativelVeiculo(ctx)) return null;
  return tipo;
}

/** Aplica preço de custo unitário quando o produto for moto ou patinete elétrico completo. */
export function aplicarPrecoCustoLinha(l: LinhaCrua): LinhaCrua {
  const tipo = detectarPrecoCusto({
    descOriginal: l.descOriginal,
    ncm: l.ncm,
    uso: l.uso,
    pesoLiqKg: l.pesoLiqKg,
    pesoBrutoKg: l.pesoBrutoKg,
    qtd: l.qtd,
  });
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
