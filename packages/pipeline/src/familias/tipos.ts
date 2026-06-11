/** Família de produto — guard-rail de capítulo/posição (não decide NCM-8). */

export interface FamiliaProduto {
  id: string;
  /** Prefixos NCM: capítulo (2 díg.) e/ou posição (4 díg.), ex.: ["9401","9403"]. */
  prefixos: string[];
  /** Detecta família na descrição (PT/EN/ZH). */
  re: RegExp;
  /** Termos extras para busca na tabela Siscomex. */
  termosBusca: string;
  /** Preferência em busca Siscomex fallback — nunca impõe NCM-8 ao LLM. */
  ncmPreferidos?: string[];
}

export interface FamiliaDetectada {
  familia: FamiliaProduto;
  /** Trecho que disparou a regex (debug/testes). */
  match: string;
}

export interface ResultadoDeteccaoFamilias {
  familias: FamiliaDetectada[];
  conflito: boolean;
  avisoConflito?: string;
}
