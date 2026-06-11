/** Cache em memória para juiz LLM de compatibilidade (ncm + hash descrição). */

import { createHash } from "node:crypto";
import type { ResultadoCompatibilidade } from "./compatibilidade-produto.js";

const cache = new Map<string, ResultadoCompatibilidade>();

function hashDescricao(desc: string): string {
  return createHash("sha256").update(desc.normalize("NFC")).digest("hex").slice(0, 16);
}

export function chaveCacheCompatibilidade(ncm: string, descricaoProduto: string): string {
  const key = ncm.replace(/\D/g, "").padStart(8, "0");
  return `${key}:${hashDescricao(descricaoProduto.trim().toLowerCase())}`;
}

export function lerCacheCompatibilidade(ncm: string, descricaoProduto: string): ResultadoCompatibilidade | undefined {
  return cache.get(chaveCacheCompatibilidade(ncm, descricaoProduto));
}

export function gravarCacheCompatibilidade(
  ncm: string,
  descricaoProduto: string,
  resultado: ResultadoCompatibilidade,
): void {
  cache.set(chaveCacheCompatibilidade(ncm, descricaoProduto), resultado);
}

/** Apenas para testes. */
export function limparCacheCompatibilidade(): void {
  cache.clear();
}
