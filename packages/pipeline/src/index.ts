export {
  lookupBenchmark,
  buildBenchmarkIndex,
  registrarHistorico,
  normalizarNcm,
  calcPisoDefensavel,
  calcTetoHeuristico,
  getComexStatStats,
  type ComexStatEntry,
  type ComexEntry,
  type ComexSeed,
  type BenchmarkIndex,
  type HistoricoEntry,
} from "./benchmark.js";
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
  preencherFobKgPlanilha,
  preencherFobKgItens,
  fobKgNcmMaisProximo,
  fobKgDaLinha,
  indiceFobKgPlanilha,
  type ReferenciaFobKgPlanilha,
} from "./fob-kg-planilha.js";
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
  criarNcmCatalog,
  loadNcmVigente,
  normNcm8,
  type NcmCatalog,
  type NcmVigenteCache,
} from "./ncm-catalog.js";
export { resolveNcm, type ResolveNcmResult, type NcmFonte } from "./resolve-ncm.js";
export {
  detectarFamilia,
  candidatosSiscomexPorDescricao,
  validarNcmItem,
  ncmCoerenteComFamilia,
  enriquecerTextoClassificacao,
  FAMILIAS_PRODUTO,
  type FamiliaProduto,
} from "./classificar-ncm.js";
export {
  criarTecSource,
  type TecCache,
  type TecEntry,
  type AliquotaSource,
  type AliquotaResult,
} from "./tec.js";
