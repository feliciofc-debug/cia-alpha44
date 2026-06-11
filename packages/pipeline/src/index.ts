export {
  lookupBenchmark,
  buildBenchmarkIndex,
  registrarHistorico,
  substituirHistoricoBenchmark,
  getHistoricoBenchmarkStats,
  normalizarNcm,
  calcPisoDefensavel,
  calcTetoHeuristico,
  getComexStatStats,
  type ComexStatEntry,
  type ComexEntry,
  type ComexSeed,
  type BenchmarkIndex,
  extrairMesReferencia,
  type HistoricoEntry,
} from "./benchmark.js";
export {
  AVISO_BENCHMARK_SO_PONDERADA,
  referenciaPrimariaBenchmark,
  benchmarkSoPonderado,
  fobKgParaPreenchimento,
  periodoLabel,
  filtrosUltimosMesesFechados,
} from "./benchmark-metrics.js";
export {
  preencherFobKgPlanilha,
  preencherFobKgItens,
  fobKgNcmMaisProximo,
  fobKgDaLinha,
  indiceFobKgPlanilha,
  distanciaNcm,
  DISTANCIA_MAX_NCM_IRMAO,
  type ReferenciaFobKgPlanilha,
} from "./fob-kg-planilha.js";
export {
  detectarBasePesoFob,
  pesoParaBaseFob,
  TOLERANCIA_RECONCILIACAO_FOB,
  type FobKgBase,
} from "./detectar-base-peso-fob.js";
export { resolvePesoLiqLinha, type LinhaCrua } from "./linha.js";
export {
  PRECO_CUSTO_MOTO_USD,
  PRECO_CUSTO_PATINETE_USD,
  aplicarPrecoCustoLinha,
  aplicarPrecoCustoLinhas,
  detectarPrecoCusto,
  precoCustoUnitarioUSD,
  rotuloPrecoCusto,
  type TipoPrecoCusto,
} from "./preco-custo.js";
export {
  aplicarRegrasFobItens,
  anexarMetaFobItem,
  resolverFobKgPlanilha,
  formatarFobKgFonteBenchmark,
  FOB_KG_FONTE_PRECO_CUSTO,
  FOB_KG_FONTE_PENDENTE,
  FOB_KG_FONTE_LINHA,
  type FobKgMeta,
} from "./resolver-fob-kg.js";
export { calibrarFobKg, calcFobKg, type CalibradorInput } from "./calibrador.js";
export { analisarRisco, type RiscoInput } from "./risco.js";
export {
  parsePlanilhaBuffer,
  parseOcrTexto,
  parseSupplierFile,
  parseSupplierOcrText,
  textoOcrParaLinhas,
  type ResultadoParse,
  type ParsedSupplierFile,
  type LinhaFornecedor,
  type ColunaMapeada,
  type ColunaDetectada,
} from "./parser.js";
export { loadComexSeed, loadTecCache, loadNcmVigenteCache, defaultSeedPath, tecCachePath, ncmVigenteDataPath } from "./seed.js";
export {
  fetchComexStatImport,
  fetchComexStatSeed,
  fetchComexStatFobKg,
  buildComexSeed,
  comexRowsParaEntradas,
  COMEXSTAT_CHINA_MARITIMO_2023S1,
  type ComexStatFiltros,
  type ComexStatApiRow,
} from "./comexstat-api.js";
export {
  parseBenchmarkPlanilhaBuffer,
  historicoFromPlanilhaSeed,
  type BenchmarkPlanilhaSeed,
  type BenchmarkPlanilhaEntry,
} from "./benchmark-planilha.js";
export {
  loadBenchmarkPlanilha,
  saveBenchmarkPlanilha,
  benchmarkPlanilhaStats,
  defaultBenchmarkPlanilhaPath,
} from "./benchmark-historico-store.js";
export {
  criarNcmCatalog,
  loadNcmVigente,
  normNcm8,
  type NcmCatalog,
  type NcmVigenteCache,
  type NcmVigenteEntry,
} from "./ncm-catalog.js";
export {
  montarCandidatosPasse1,
  listarNcm8DaPosicao,
  type PosicaoCandidata,
  type Ncm8Posicao,
} from "./ncm-posicoes.js";
export { isFolhaGenericaOutros, aplicarDesempateOutros } from "./desempate-outros.js";
export { resolveNcm, type ResolveNcmResult, type NcmFonte } from "./resolve-ncm.js";
export {
  detectarFamilia,
  detectarFamilias,
  avisoConflitoFamilias,
  candidatosSiscomexPorDescricao,
  validarNcmItem,
  ncmCoerenteComFamilia,
  ncmCoerenteComPrefixo,
  prefixosDasFamilias,
  prefixoBuscaPrincipal,
  enriquecerTextoClassificacao,
  textoClassificacaoIa,
  FAMILIAS_PRODUTO,
  type FamiliaProduto,
  type FamiliaDetectada,
  type ResultadoDeteccaoFamilias,
  type DetectarFamiliasInput,
} from "./classificar-ncm.js";
export {
  criarTecSource,
  type TecEntry,
  type TecEntryLegado,
  type TecCache,
  type AliquotaSource,
  type AliquotaResult,
} from "./tec.js";
