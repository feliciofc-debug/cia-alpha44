/** Estado compartilhado da API: seeds carregados, índices e provedor de IA. */

import {
  buildBenchmarkIndex,
  criarNcmCatalog,
  criarTecSource,
  loadComexSeed,
  loadNcmVigenteCache,
  loadTecCache,
  type AliquotaSource,
  type BenchmarkIndex,
  type ComexEntry,
  type NcmCatalog,
} from "@cia/pipeline";
import { escolherProvider, comFallback, type LlmProvider } from "./llm/index.js";
import { criarMockProvider } from "./llm/mock.js";
import { escolherOcrProvider, type OcrProvider } from "./ocr/index.js";
import { escolherSiscomexProvider, type SiscomexProvider } from "./siscomex/index.js";
import { criarTecSourceHibrido } from "./siscomex/tec-hybrid.js";

export interface AppState {
  comexSeed: ComexEntry[];
  benchmarkIndex: BenchmarkIndex;
  tecSource: AliquotaSource;
  ncmCatalog: NcmCatalog;
  provider: LlmProvider;
  ocr: OcrProvider;
  siscomex: SiscomexProvider;
}

let state: AppState | null = null;

export function getState(): AppState {
  if (state) return state;
  const comex = loadComexSeed();
  const tec = loadTecCache();
  const benchmarkIndex = buildBenchmarkIndex(comex.itens);
  const siscomex = escolherSiscomexProvider();
  const tecBase = criarTecSource(tec);
  const tecSource = siscomex.operacional ? criarTecSourceHibrido(tecBase, siscomex) : tecBase;
  const ncmCatalog = criarNcmCatalog(loadNcmVigenteCache());
  const mock = criarMockProvider(comex.itens);
  const provider = comFallback(escolherProvider(comex.itens), mock);
  const ocr = escolherOcrProvider();
  state = { comexSeed: comex.itens, benchmarkIndex, tecSource, ncmCatalog, provider, ocr, siscomex };
  return state;
}

/** Recarrega benchmark ComexStat após `node tools/fetch-comexstat-api.cjs`. */
export function recarregarComexBenchmark(): BenchmarkIndex {
  const s = getState();
  const comex = loadComexSeed();
  s.comexSeed = comex.itens;
  s.benchmarkIndex = buildBenchmarkIndex(comex.itens);
  return s.benchmarkIndex;
}

/** Recarrega tabela NCM vigente Siscomex após `node tools/fetch-ncm-siscomex.cjs`. */
export function recarregarNcmCatalog(): NcmCatalog {
  const s = getState();
  s.ncmCatalog = criarNcmCatalog(loadNcmVigenteCache());
  return s.ncmCatalog;
}
