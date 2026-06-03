export {
  lookupBenchmark,
  registrarHistorico,
  normalizarNcm,
  calcPisoDefensavel,
  calcTetoHeuristico,
  getComexStatStats,
  type ComexStatEntry,
  type ComexSeed,
  type HistoricoEntry,
} from "./benchmark.js";
export { calibrarFobKg, calcFobKg, type CalibradorInput } from "./calibrador.js";
export { analisarRisco, type RiscoInput } from "./risco.js";
export {
  parsePlanilhaBuffer,
  type ResultadoParse,
  type LinhaFornecedor,
  type ColunaMapeada,
  type ColunaDetectada,
} from "./parser.js";
export { loadComexSeed, loadTecCache, defaultSeedPath, tecCachePath } from "./seed.js";
export {
  criarTecSource,
  type TecCache,
  type TecEntry,
  type AliquotaSource,
  type AliquotaResult,
} from "./tec.js";
