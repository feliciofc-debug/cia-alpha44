/**
 * Validação de NCM antes de gravar cache humano (confirmadoHumano).
 * Impede override incoerente (ex.: moto → 9617) de envenenar cache global.
 */

import { normNcm8, type NcmCatalog } from "../ncm-catalog.js";
import type { ClassificacaoCacheKeyInput } from "../classificacao-cache-key.js";
import { detectarFamilias } from "./detectar.js";
import { ncmCoerenteComFamilia } from "./coerencia.js";

/** Famílias de material — não ancoram validação sozinhas. */
const IDS_MATERIAL = new Set(["aluminio", "metal_ferro_aco", "plasticos_chapas", "plastico_utilidades"]);

export interface ValidacaoCacheHumano {
  ok: boolean;
  motivo?: string;
}

export function validarNcmParaCacheHumano(
  catalog: NcmCatalog,
  input: ClassificacaoCacheKeyInput,
  ncm: string,
): ValidacaoCacheHumano {
  const ncmKey = normNcm8(ncm);
  if (!ncmKey || !catalog.existe(ncmKey)) {
    return { ok: false, motivo: `NCM ${ncm || "(vazio)"} inválido ou ausente na tabela Siscomex.` };
  }

  const det = detectarFamilias({
    descOriginal: input.descOriginal,
    uso: input.uso ?? null,
  });
  const prodFamilias = det.familias
    .map((f) => f.familia)
    .filter((f) => !IDS_MATERIAL.has(f.id));

  if (prodFamilias.length === 0) return { ok: true };

  const coerente = prodFamilias.some((f) => ncmCoerenteComFamilia(ncmKey, f));
  if (coerente) return { ok: true };

  const ids = prodFamilias.map((f) => f.id).join(", ");
  return {
    ok: false,
    motivo: `NCM ${ncmKey} incoerente com família(ões) de produto (${ids}) — cache humano não gravado.`,
  };
}
