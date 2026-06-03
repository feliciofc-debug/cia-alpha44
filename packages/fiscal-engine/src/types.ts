/**
 * Tipos do motor fiscal CIA / Alpha 44.
 *
 * Convenções:
 *  - Alíquotas são FRAÇÕES (0.162 = 16,2%), não percentuais.
 *  - Valores monetários são `number` (ponto flutuante) para reproduzir
 *    exatamente a aritmética da planilha-mãe (planilha 66). O arredondamento
 *    é responsabilidade da camada de apresentação.
 *  - "Entrada" = nacionalização (II/IPI/PIS/COFINS sobre o CIF).
 *  - "Saída" = formação de preço / nota fiscal de venda (DIFs, ICMS, CSLL, IRRF, markup).
 */

/** Item de cotação como entra no motor (alíquotas já resolvidas por NCM). */
export interface ItemFiscalInput {
  /** Identificador livre (NCM, código interno, etc.) — usado só para rastreio. */
  ref?: string;
  ncm: string;
  /** FOB do item na moeda da cotação (US$). */
  fobUS: number;
  /** Peso líquido do item em kg. */
  pesoLiqKg: number;
  aliqII: number;
  aliqIPI: number;
  aliqPIS: number;
  aliqCOFINS: number;
  /** ICMS de entrada — diferido em Alagoas (default 0, não compõe a nacionalização). */
  aliqICMSEntrada?: number;
}

/** Despesa operacional (taxas locais) — tabela editável por cotação. */
export interface Despesa {
  nome: string;
  /** Valor em R$. */
  valorBRL: number;
  /**
   * Se entra na BASE de markup e impostos de saída (M109 na planilha 66).
   * Na planilha-mãe apenas um subconjunto das taxas locais entrava nessa base.
   * Default: true.
   */
  entraBaseSaida?: boolean;
  /**
   * Se entra na BASE NOTA SAÍDA (usada no cálculo do IRRF — J13 na planilha 66).
   * Default: true.
   */
  entraBaseNota?: boolean;
}

/** Parâmetros tributários da cascata de saída (defaults = planilha 66 / regime atual). */
export interface ParamsSaida {
  /** Percentual de markup sobre o custo nacionalizado. Default 0.06 (6%). */
  markupPct: number;
  /** PIS na venda. Default 0.0165 (1,65%). */
  pisSaida: number;
  /** COFINS na venda. Default 0.076 (7,6%). */
  cofinsSaida: number;
  /** ICMS na venda. Default 0.04 (4%) — regra Alagoas. */
  icmsSaida: number;
  /** CSLL sobre o markup. Default 0.09 (9%). */
  csllSobreMarkup: number;
  /** Alíquota do IRRF. Default 0.25 (25%). */
  irrfAliq: number;
  /** Presunção sobre a BASE NOTA usada no IRRF. Default 0.027 (2,7%). */
  irrfBaseNotaPct: number;
  /** Teto da alíquota média de IPI que muda a base do DIF IPI. Default 0.15 (15%). */
  ipiTetoAliqMedia: number;
  /** ICMS de entrada (crédito) — diferido em Alagoas. Default 0. */
  icmsEntrada: number;
}

/** Cabeçalho da cotação. */
export interface CotacaoFiscalInput {
  /** Câmbio (R$ por unidade da moeda). Ex.: 5.2051. */
  cambio: number;
  /** Frete internacional total na moeda (US$). */
  freteTotalUS: number;
  /** Adicionais ao Valor Aduaneiro (THC, CE) em US$. Default 0. */
  adicionaisVaUS?: number;
  /** Redução da base de cálculo em US$ (ex-tarifário etc.). Default 0. */
  reducaoBaseUS?: number;
  /** Taxa Siscomex em R$. */
  siscomex: number;
  /** Antidumping total em R$. Default 0. */
  antidumpingBRL?: number;
  itens: ItemFiscalInput[];
  despesas: Despesa[];
  /**
   * Override da base de despesas do markup/impostos de saída (M109 na planilha 66).
   * Na planilha-mãe este valor é independente das taxas locais. Se omitido, o motor
   * usa a soma das despesas marcadas com `entraBaseSaida`.
   */
  outrasDespesasBaseBRL?: number;
  params: ParamsSaida;
}

/** Resultado fiscal de um item (cascata de entrada). */
export interface ItemFiscalResult {
  ref?: string;
  ncm: string;
  fobUS: number;
  pesoLiqKg: number;
  /** Frete global rateado por kg (mesmo para todos os itens). */
  freteKgGlobal: number;
  /** CIF por kg do item (US$/kg). */
  cifKgUS: number;
  cifItemUS: number;
  cifItemBRL: number;
  ii: number;
  ipi: number;
  pis: number;
  cofins: number;
  /** ICMS de entrada — diferido (0 em Alagoas). */
  icmsEntrada: number;
  aliqII: number;
  aliqIPI: number;
  aliqPIS: number;
  aliqCOFINS: number;
}

/** Totais de entrada (somatório dos itens). */
export interface TotaisEntrada {
  fobTotalUS: number;
  pesoLiqTotalKg: number;
  cifTotalBRL: number;
  iiTotal: number;
  ipiTotal: number;
  pisTotal: number;
  cofinsTotal: number;
  siscomex: number;
  antidumpingBRL: number;
  /** Soma dos impostos de entrada + Siscomex (M107 na planilha 66). */
  impostosEntradaTotal: number;
}

/** Resultado da cascata de saída (formação de preço). */
export interface ResultadoSaida {
  /** Base de despesas que entra no markup/impostos de saída (M109). */
  outrasDespesasBaseBRL: number;
  /** Soma de TODAS as despesas operacionais. */
  taxasLocaisTotalBRL: number;
  aliqMediaIPI: number;
  markup: number;
  baseSaida: number;
  vendaLiquida: number;
  difIPI: number;
  difPIS: number;
  difCOFINS: number;
  icmsSaida: number;
  csll: number;
  irrf: number;
  baseNotaSaida: number;
  /** Soma dos impostos de saída (DIFs + ICMS + CSLL + IRRF). */
  impostosSaidaTotal: number;
}

/** Resultado completo da cotação. */
export interface ResultadoCotacao {
  cambio: number;
  itens: ItemFiscalResult[];
  entrada: TotaisEntrada;
  saida: ResultadoSaida;
  /** Total global em R$ (impostos entrada + taxas locais + impostos saída + markup). */
  totalBRL: number;
  /** Total global em US$ (totalBRL / câmbio). */
  totalUS: number;
}

/** Defaults dos parâmetros de saída (regime CIA/Alagoas). Markup default 6%. */
export const PARAMS_SAIDA_PADRAO: ParamsSaida = {
  markupPct: 0.06,
  pisSaida: 0.0165,
  cofinsSaida: 0.076,
  icmsSaida: 0.04,
  csllSobreMarkup: 0.09,
  irrfAliq: 0.25,
  irrfBaseNotaPct: 0.027,
  ipiTetoAliqMedia: 0.15,
  icmsEntrada: 0,
};
