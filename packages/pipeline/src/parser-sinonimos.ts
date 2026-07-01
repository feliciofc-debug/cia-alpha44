/**
 * Sinônimos multilíngues e fallback de mapeamento de colunas (DE/ES/FR/PT/EN/ZH).
 */

import type { ColunaDetectada, ColunaMapeada } from "./parser.js";

export const RE_NCM_MULTILINGUE =
  /(?:\bn\s*[\.\-\s]*c\s*[\.\-\s]*m\b|\bh\s*[\.\-\s]*s\s*[\.\-\s]*code\b|\bh\s*[\.\-\s]*s\s*[\.\-\s]*编码|tariff|zolltarif|taric|税号|海关编码|商品编码|税则号|c[oó]d(?:igo)?\.?\s*fiscal)/i;

/** Padrões estendidos — mesma ordem de prioridade que parser.ts (bruto antes de líquido). */
export const PADROES_MULTILINGUE: { tipo: ColunaDetectada; re: RegExp }[] = [
  {
    tipo: "descricao",
    re: /desc|description|warenbezeichnung|bezeichnung|beschreibung|designation|d[eé]signation|denominaci[oó]n|descripci[oó]n|品名|货物|产品配置|配置|product\s*config|product|nome|mercadoria|中文品名|英文品名|trade\s*name/i,
  },
  {
    tipo: "qtd",
    re: /qty|quant|quantity|menge|cantidad|quantit[eé]|unidades?|数量|总数量|\bpcs\b|qtd\b|unidade|\bvpe\b/i,
  },
  { tipo: "peso_bruto", re: /gross|bruto|bruttogewicht|brutt|peso\s*bruto|poids\s*brut|毛重|gw\b/i },
  {
    tipo: "peso",
    re: /nettogewicht|nettogew|peso\s*l[ií]q|peso\s*neto|poids\s*net|peso|weight|净重|nw\b|net|(?<!brutt)gewicht|kg/i,
  },
  {
    tipo: "fob",
    re: /fob|total.*usd|total.*eur|amount|valor.*us|valor.*eur|gesamt|总价|wert\s*gesamt/i,
  },
  {
    tipo: "preco",
    re: /price|preço|preco|preis|stückpreis|stuckpreis|einzelpreis|unitario|unit[aá]rio|precio|prix|单价|unit|usd\/kg|eur\)/i,
  },
  { tipo: "ncm", re: RE_NCM_MULTILINGUE },
  { tipo: "dimensoes", re: /dim|size|maß|mass|medida|规格|measure|tamanho/i },
];

export const RE_QTD_CAIXAS_MULTILINGUE =
  /qtd\s*caixas|qtde\s*caixas|quantidade\s*caixas|kartons?|cartons?|caixas?|colli|箱数|number\s*of\s*cartons?|cx\s*\/?\s*caixa/i;

export const RE_QTD_POR_CAIXA_MULTILINGUE =
  /qtd\s*por\s*caixa|qtde\s*por\s*caixa|por\s*caixa|per\s*box|per\s*case|stück\s*je\s*karton|stuck\s*je|stück\s*pro|pieces?\s*per|每箱|单箱个数|装箱量|pcs\s*per|vpe\b/i;

export const RE_MATERIAL_MULTILINGUE = /material|werkstoff|mat[eé]ria|材质|matériau/i;

export const RE_USO_MULTILINGUE =
  /verwendungszweck|verwendung|zweck|uso|用途|usage|application|aplica[cç][aã]o|utilisation|destino/i;

export const RE_SKU_MULTILINGUE =
  /货号|item\s*number|REF|唛头|artikel-nr|artikelnummer|sku|referenz|ref\b|model|modelo|产品型号/i;

export const RE_DESC_EN_MULTILINGUE =
  /beschreibung\s*\(\s*EN\s*\)|english|trade\s*name|品名（英文）|英文|descripci[oó]n\s*\(\s*EN/i;

export const RE_DESC_DE_MULTILINGUE = /warenbezeichnung|bezeichnung\s*\(\s*DE\s*\)/i;

export const RE_DESC_PT_MULTILINGUE = /portugues|português|desc.*port/i;

export function detectarTipoMultilingue(header: string): { tipo: ColunaDetectada; confianca: number } {
  const h = String(header).trim();
  if (!h) return { tipo: "desconhecido", confianca: 0 };
  if (/artikel-nr|artikelnummer|item\s*number|货号|^\s*sku\b|^\s*ref\b/i.test(h)) {
    return { tipo: "desconhecido", confianca: 0 };
  }
  if (/stückpreis|stuckpreis|einzelpreis|unit\s*price|preço\s*unit|preco\s*unit|prix\s*unitaire|precio\s*unitario/i.test(h)) {
    return { tipo: "preco", confianca: 0.92 };
  }
  if (/stück\s*je|stuck\s*je|je\s*karton|pcs\s*per|por\s*caixa|per\s*box|per\s*case/i.test(h) && !/gewicht|weight|peso|poids/i.test(h)) {
    return { tipo: "desconhecido", confianca: 0 };
  }
  if (/total.*fob|fob.*total|valor\s*total\s*fob|fob\s*total|gesamtwert/i.test(h)) {
    return { tipo: "fob", confianca: 0.95 };
  }
  if (/fob\s*\/?\s*kg|pre[cç]o\s*fob|preco\s*fob|usd\s*\/?\s*kg\s*imp|dol.*kg.*imp/i.test(h)) {
    return { tipo: "fob_kg", confianca: 0.92 };
  }
  if (/subitem\s*ncm/i.test(h) && !/cod/i.test(h)) {
    return { tipo: "descricao", confianca: 0.88 };
  }
  for (const { tipo, re } of PADROES_MULTILINGUE) {
    if (re.test(h)) return { tipo, confianca: 0.85 };
  }
  return { tipo: "desconhecido", confianca: 0 };
}

/** Fallback: re-mapeia colunas por sinônimos multilíngues. */
export function mapearColunasPorSinonimos(headers: string[]): ColunaMapeada[] {
  return headers.map((h, indice) => {
    const header = String(h ?? `Col${indice}`);
    const { tipo, confianca } = detectarTipoMultilingue(header);
    return { indice, header, tipo, confianca: tipo === "desconhecido" ? 0 : Math.max(confianca, 0.75) };
  });
}

export type MapeamentoColunasIA = Partial<Record<ColunaDetectada, number>>;

export interface EntradaMapeamentoIA {
  headers: string[];
  amostras: unknown[][];
}

/** Mescla mapeamento IA sobre colunas existentes (só preenche desconhecidos). */
export function aplicarMapeamentoIA(
  colunas: ColunaMapeada[],
  mapa: MapeamentoColunasIA,
): ColunaMapeada[] {
  const out = colunas.map((c) => ({ ...c }));
  for (const [campo, idx] of Object.entries(mapa)) {
    if (idx == null || idx < 0 || idx >= out.length) continue;
    const tipo = campo as ColunaDetectada;
    if (tipo === "desconhecido") continue;
    const atual = out[idx]!;
    if (atual.tipo === "desconhecido" || atual.confianca < 0.7) {
      out[idx] = { ...atual, tipo, confianca: 0.72 };
    }
  }
  return out;
}

export const AVISO_MAPEAMENTO_IA = "Mapeamento de colunas por IA — confira descrição, qtd e preços.";

export const AVISO_MAPEAMENTO_SINONIMOS =
  "Mapeamento automático por sinônimos multilíngues — confira colunas se algo parecer errado.";

export const AVISO_MAPEAMENTO_MANUAL_INEXISTENTE =
  "Não foi possível mapear todas as colunas automaticamente. Confira se a planilha tem cabeçalho de itens (descrição, quantidade, preço) ou envie formato .xlsx do fornecedor.";
