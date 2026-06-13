/**
 * Chave determinística do cache de classificação NCM (P3b).
 * sha256(descOriginal|material|uso|promptVersion|catalogVersion) — campos normalizados.
 */

import { createHash } from "node:crypto";
import type { NcmCatalog } from "./ncm-catalog.js";

export interface ClassificacaoCacheKeyInput {
  descOriginal: string;
  material?: string | null;
  uso?: string | null;
}

/** Trim + lowercase; ausente → string vazia. */
export function normalizarCampoCache(val: string | null | undefined): string {
  if (val == null) return "";
  return val.trim().toLowerCase();
}

export function catalogVersionKey(catalog: Pick<NcmCatalog, "total" | "dataUltimaAtualizacao">): string {
  const data = catalog.dataUltimaAtualizacao?.trim() || "none";
  return `${catalog.total}_${data}`;
}

/** Partes concatenadas antes do hash (auditável). */
export function partesChaveClassificacaoCache(
  input: ClassificacaoCacheKeyInput,
  promptVersion: string,
  catalogVersion: string,
): string {
  const desc = normalizarCampoCache(input.descOriginal);
  const material = normalizarCampoCache(input.material);
  const uso = normalizarCampoCache(input.uso);
  const pv = promptVersion.trim();
  const cv = catalogVersion.trim();
  return `${desc}|${material}|${uso}|${pv}|${cv}`;
}

export function chaveClassificacaoCache(
  input: ClassificacaoCacheKeyInput,
  promptVersion: string,
  catalogVersion: string,
): string {
  return createHash("sha256")
    .update(partesChaveClassificacaoCache(input, promptVersion, catalogVersion), "utf8")
    .digest("hex");
}
