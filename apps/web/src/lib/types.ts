/** Tipos espelhados das respostas da API (desacoplado do backend para o bundle do browser). */

export type Canal = "VERDE_PROVAVEL" | "AMARELO_TECNICO" | "VERMELHO_TECNICO" | "CINZA_VALORACAO";
export type FonteBenchmark = "ComexStat" | "Histórico próprio" | "sem base";

export interface Aliquotas {
  ii: number;
  ipi: number;
  pis: number;
  cofins: number;
  icmsEntrada: number;
}

export interface NcmCandidato {
  ncm: string;
  descricaoOficial?: string;
  confianca: number;
}

export interface Benchmark {
  fonte: FonteBenchmark;
  mediaFobKg: number | null;
  pisoDefensavel: number | null;
  teto: number | null;
  amostra: number;
  nota: string;
}

export interface Calibracao {
  fobKgOriginal: number | null;
  fobKgCalibrado: number;
  desvioBenchmarkPct: number | null;
  ajustado: boolean;
  justificativa: string;
}

export interface Risco {
  canal: Canal;
  score: number;
  justificativa: string;
  flags: string[];
}

export interface Item {
  id?: string;
  descOriginal: string;
  descPt: string;
  descDuimp: string;
  ncm: string;
  ncmCandidatos: NcmCandidato[];
  pesoBrutoKg: number | null;
  pesoLiqKg: number;
  qtd: number | null;
  fobUnitarioUS: number | null;
  fobTotalUS: number;
  aliquotas: Aliquotas;
  aliquotasOverride: boolean;
  benchmark?: Benchmark;
  calibracao?: Calibracao;
  risco?: Risco;
  anuencia: string[];
  antidumping: boolean;
  fotoBase64?: string;
  fotoMime?: string;
  fotoPath?: string;
  fotoUrl?: string;
  ncmValido?: boolean;
  ncmFonte?: "planilha" | "ia" | "pendente";
  ncmDescricaoOficial?: string;
  ncmAvisos?: string[];
}

export interface Despesa {
  nome: string;
  valorBRL: number;
  entraBaseSaida: boolean;
  entraBaseNota: boolean;
}

export interface ParamsSaida {
  markupPct: number;
  pisSaida: number;
  cofinsSaida: number;
  icmsSaida: number;
  csllSobreMarkup: number;
  irrfAliq: number;
  irrfBaseNotaPct: number;
  ipiTetoAliqMedia: number;
  icmsEntrada: number;
}

export type BeneficioFiscal = "ALAGOAS" | "NENHUM";

export interface Cotacao {
  id?: string;
  empresaTrade?: string;
  cliente: string;
  benefFiscal: BeneficioFiscal | string;
  moeda: string;
  cambio: number;
  freteTotalUS: number;
  adicionaisVaUS: number;
  reducaoBaseUS: number;
  siscomex: number;
  antidumpingBRL: number;
  incoterm: string;
  origem: string;
  destino: string;
  itens: Item[];
  despesas: Despesa[];
  qtdContainers?: number;
  outrasDespesasBaseBRL?: number;
  params: ParamsSaida;
}

export interface ItemResult {
  ref?: string;
  ncm: string;
  fobUS: number;
  pesoLiqKg: number;
  freteKgGlobal: number;
  cifKgUS: number;
  cifItemUS: number;
  cifItemBRL: number;
  ii: number;
  ipi: number;
  pis: number;
  cofins: number;
  icmsEntrada: number;
}

export interface ResultadoCotacao {
  cambio: number;
  itens: ItemResult[];
  entrada: {
    fobTotalUS: number;
    pesoLiqTotalKg: number;
    cifTotalBRL: number;
    iiTotal: number;
    ipiTotal: number;
    pisTotal: number;
    cofinsTotal: number;
    siscomex: number;
    antidumpingBRL: number;
    impostosEntradaTotal: number;
  };
  saida: {
    outrasDespesasBaseBRL: number;
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
    impostosSaidaTotal: number;
  };
  totalBRL: number;
  totalUS: number;
}

export interface ParsedSheet {
  arquivo?: string;
  fonte?: "planilha" | "ocr";
  ocrPaginas?: number;
  abaUsada: string;
  headerRowIndex: number;
  colunas: { campo: string; colIndex: number; header: string; confianca: number }[];
  mapeamento: Record<string, number>;
  linhas: LinhaCrua[];
  totalLinhas: number;
  avisos: string[];
}

export type CotacaoStatus = "RASCUNHO" | "CALCULADA" | "ARQUIVADA";

export interface ResumoFinanceiro {
  custoImportacaoBRL: number;
  impostosSaidaBRL: number;
  custoOperacionalBRL: number;
  markupBRL: number;
  markupPct: number;
  csllBRL: number;
  irrfBRL: number;
  lucroLiquidoTradeBRL: number;
  totalOrcamentoBRL: number;
  margemSobreCustoPct: number;
}

export interface CotacaoResumo {
  id: string;
  cliente: string;
  status: CotacaoStatus;
  totalBRL: number | null;
  canalPredominante: Canal | null;
  origem: string;
  destino: string;
  icmsSaidaPct: number | null;
  markupPct: number;
  markupBRL: number | null;
  lucroLiquidoTradeBRL: number | null;
  custoImportacaoBRL: number | null;
  impostosSaidaBRL: number | null;
  custoOperacionalBRL: number | null;
  totalItens: number;
  criadoEm: string;
}

export interface CotacaoLista {
  cotacoes: CotacaoResumo[];
  totalHoje: number;
}

export interface MesSerie {
  mes: string;
  label: string;
  processos: number;
  volumeBRL: number;
  lucroTradeBRL: number;
  lucroLiquidoBRL: number;
}

export interface DashboardSeries {
  serie: MesSerie[];
  projecaoMensal: { volumeBRL: number; lucroTradeBRL: number; processos: number };
  projecaoAnual: {
    volumeBRL: number;
    lucroTradeBRL: number;
    baseMediaMensalVolume: number;
    baseMediaMensalLucro: number;
  };
  mesAtual: { chave: string; processos: number; volumeBRL: number; lucroTradeBRL: number; lucroLiquidoBRL: number };
}

export interface ClienteResumo {
  cliente: string;
  processos: number;
  volumeBRL: number;
  lucroTradeBRL: number;
  markupMedioPct: number;
  ultimaCotacaoId: string;
  ultimaCotacaoEm: string;
  destinos: string[];
}

export interface RelatorioProcesso {
  id: string;
  cliente: string;
  destino: string;
  criadoEm: string;
  totalBRL: number;
  lucroTradeBRL: number;
  lucroLiquidoBRL: number;
}

export interface RelatorioMes {
  mes: string;
  label: string;
  mesNum: number;
  processos: number;
  volumeBRL: number;
  lucroTradeBRL: number;
  lucroLiquidoBRL: number;
}

export interface RelatorioFaturamento {
  tipo: "mensal" | "anual";
  ano: number;
  mes?: number;
  periodoLabel: string;
  empresa: string;
  geradoEm: string;
  meses: RelatorioMes[];
  totais: {
    processos: number;
    volumeBRL: number;
    lucroTradeBRL: number;
    lucroLiquidoBRL: number;
    ticketMedioBRL: number;
  };
  processos: RelatorioProcesso[];
}

export interface DashboardKpis {
  totalCotacoes: number;
  cotacoesHoje: number;
  cotacoesSemana: number;
  cotacoesMes: number;
  volumeOrcadoBRL: number;
  lucroTradeTotalBRL: number;
  markupMedioPct: number;
  ticketMedioBRL: number;
  porCanal: Record<string, number>;
  porDestino: { uf: string; qtd: number; volumeBRL: number }[];
  recentes: CotacaoResumo[];
  amostra: number;
}

export interface CotacaoSalva {
  id: string;
  status: CotacaoStatus;
  criadoEm: string;
  calculadoEm: string | null;
  canalPredominante: Canal | null;
  totalBRL: number | null;
  financeiro: ResumoFinanceiro | null;
  provider: string | null;
  cotacao: Cotacao;
  itens: Item[];
  resultado: ResultadoCotacao | null;
  avisoFiscal: string | null;
}

export interface LinhaCrua {
  __row: number;
  descOriginal: string;
  ncm: string | null;
  qtd: number | null;
  unidade: string | null;
  pesoBrutoKg: number | null;
  pesoLiqKg: number | null;
  fobUnitarioUS: number | null;
  fobTotalUS: number | null;
  dimensoes: string | null;
  fotoBase64?: string;
  fotoMime?: string;
}
