/** Serviço de conferência NCM — endpoint isolado, não altera /api/classificar. */

import {
  conferirLoteNcm,
  type EntradaConferenciaNcm,
  type ItemConferenciaNcm,
  type SiscomexProvider,
} from "../siscomex/index.js";

export interface ConferenciaNcmResult {
  siscomexConfigurado: boolean;
  siscomexOperacional: boolean;
  itens: ItemConferenciaNcm[];
}

export async function conferirNcmItens(
  siscomex: SiscomexProvider,
  itens: EntradaConferenciaNcm[],
): Promise<ConferenciaNcmResult> {
  const siscomexPorIndice = new Map<number, Awaited<ReturnType<SiscomexProvider["consultarClassificacao"]>>>();

  if (siscomex.operacional) {
    await Promise.all(
      itens.map(async (it, i) => {
        const idx = it.indice ?? i;
        const ncmRef = it.ncmPlanilha ?? it.ncmIa;
        if (!ncmRef) return;
        const out = await siscomex.consultarClassificacao(ncmRef);
        siscomexPorIndice.set(idx, out);
      }),
    );
  }

  return {
    siscomexConfigurado: siscomex.configurado,
    siscomexOperacional: siscomex.operacional,
    itens: conferirLoteNcm(itens, siscomexPorIndice, siscomex.operacional),
  };
}
