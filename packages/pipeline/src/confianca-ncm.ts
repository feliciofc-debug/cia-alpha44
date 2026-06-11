import type { NcmCandidato } from "@cia/shared";
import { normNcm8 } from "./ncm-catalog.js";

/** Confiança do NCM final — candidato IA cujo código coincide com o escolhido (não [0] cego). */
export function confiancaNcmFinal(
  ncmFinal: string,
  candidatosIa: NcmCandidato[] | undefined,
  confiancaPasse2?: number | null,
): number | null {
  const key = normNcm8(ncmFinal);
  if (!key) return null;
  const match = candidatosIa?.find((c) => normNcm8(c.ncm) === key);
  if (match?.confianca != null) return match.confianca;
  const top = candidatosIa?.[0];
  if (top && normNcm8(top.ncm) === key && confiancaPasse2 != null) return confiancaPasse2;
  return null;
}
