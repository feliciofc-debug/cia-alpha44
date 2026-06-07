/** Conferência NCM planilha × IA × Siscomex (lógica pura, sem I/O). */

import type { ItemConferenciaNcm, NcmClassificacaoOficial, StatusConferenciaNcm } from "./types.js";

export interface EntradaConferenciaNcm {
  indice?: number;
  ncmPlanilha?: string | null;
  ncmIa?: string | null;
  descricao?: string | null;
}

function normNcm(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  return d.length === 8 ? d : null;
}

function statusEntre(a: string | null, b: string | null): StatusConferenciaNcm | null {
  if (!a || !b) return null;
  return a === b ? "confere" : "diverge";
}

export function conferirItemNcm(
  entrada: EntradaConferenciaNcm,
  siscomex?: NcmClassificacaoOficial | null,
  siscomexOperacional = false,
): ItemConferenciaNcm {
  const indice = entrada.indice ?? 0;
  const ncmPlanilha = normNcm(entrada.ncmPlanilha);
  const ncmIa = normNcm(entrada.ncmIa);
  const ncmSiscomex = siscomex?.ativo ? normNcm(siscomex.ncm) : null;
  const avisos: string[] = [];

  let status: StatusConferenciaNcm;

  if (siscomexOperacional && ncmSiscomex) {
    if (ncmPlanilha && ncmPlanilha !== ncmSiscomex) {
      status = "diverge";
      avisos.push("NCM da planilha difere da base oficial Siscomex.");
    } else if (ncmIa && ncmIa !== ncmSiscomex) {
      status = "diverge";
      avisos.push("NCM sugerido pela IA difere da base oficial Siscomex.");
    } else if (ncmPlanilha && ncmIa && ncmPlanilha !== ncmIa) {
      status = "diverge";
      avisos.push("NCM da planilha difere do sugerido pela IA.");
    } else if (ncmPlanilha || ncmIa) {
      status = "confere";
    } else {
      status = "pendente_siscomex";
      avisos.push("Sem NCM na planilha ou sugerido pela IA.");
    }
  } else if (ncmPlanilha && ncmIa) {
    status = statusEntre(ncmPlanilha, ncmIa) ?? "pendente_siscomex";
    if (status === "diverge") avisos.push("NCM da planilha difere do sugerido pela IA.");
    if (!siscomexOperacional) avisos.push("Portal Único não ativo — conferência sem base oficial.");
  } else if (ncmPlanilha) {
    status = "so_planilha";
    avisos.push("Apenas NCM da planilha — IA não sugeriu alternativa.");
  } else if (ncmIa) {
    status = "so_ia";
    avisos.push("Planilha sem NCM — usando sugestão da IA.");
  } else {
    status = "pendente_siscomex";
    avisos.push("NCM não informado.");
  }

  if (siscomex?.avisos?.length) avisos.push(...siscomex.avisos);

  return {
    indice,
    ncmPlanilha,
    ncmIa,
    ncmSiscomex,
    status,
    descricaoSiscomex: siscomex?.descricao ?? null,
    avisos,
  };
}

export function conferirLoteNcm(
  itens: EntradaConferenciaNcm[],
  siscomexPorIndice?: Map<number, NcmClassificacaoOficial>,
  siscomexOperacional = false,
): ItemConferenciaNcm[] {
  return itens.map((it, i) =>
    conferirItemNcm(
      { ...it, indice: it.indice ?? i },
      siscomexPorIndice?.get(it.indice ?? i) ?? null,
      siscomexOperacional,
    ),
  );
}
