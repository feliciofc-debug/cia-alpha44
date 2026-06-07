/** Estado compartilhado da API: seeds carregados, índices e provedor de IA. */

import {
  buildBenchmarkIndex,
  criarTecSource,
  loadComexSeed,
  loadTecCache,
  type AliquotaSource,
  type BenchmarkIndex,
  type ComexEntry,
} from "@cia/pipeline";
import { escolherProvider, comFallback, type LlmProvider } from "./llm/index.js";
import { criarMockProvider } from "./llm/mock.js";
import { escolherOcrProvider, type OcrProvider } from "./ocr/index.js";
import { escolherSiscomexProvider, type SiscomexProvider } from "./siscomex/index.js";

export interface AppState {
  comexSeed: ComexEntry[];
  benchmarkIndex: BenchmarkIndex;
  tecSource: AliquotaSource;
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
  const tecSource = criarTecSource(tec);
  const mock = criarMockProvider(comex.itens);
  const provider = comFallback(escolherProvider(comex.itens), mock);
  const ocr = escolherOcrProvider();
  const siscomex = escolherSiscomexProvider();
  state = { comexSeed: comex.itens, benchmarkIndex, tecSource, provider, ocr, siscomex };
  return state;
}
