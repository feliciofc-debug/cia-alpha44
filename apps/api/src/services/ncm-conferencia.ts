/** Serviço de conferência NCM — endpoint isolado, não altera /api/classificar. */

import { normNcm8, type NcmCatalog } from "@cia/pipeline";
import {
  avaliarCompatibilidadeProduto,
  conferirLoteNcm,
  type EntradaConferenciaNcm,
  type ItemConferenciaNcm,
  type NcmClassificacaoOficial,
  type SiscomexProvider,
} from "../siscomex/index.js";

export interface ConferenciaNcmResult {
  siscomexConfigurado: boolean;
  siscomexOperacional: boolean;
  ncmCatalogoTotal: number;
  itens: ItemConferenciaNcm[];
}

function classificacaoDoCatalogo(catalog: NcmCatalog, ncm: string): NcmClassificacaoOficial {
  const key = normNcm8(ncm) ?? ncm.replace(/\D/g, "").padStart(8, "0");
  const ativo = catalog.existe(key);
  return {
    ncm: key,
    descricao: catalog.descricao(key),
    ativo,
    fonte: ativo ? "portal-unico-clsf" : "indisponivel",
    dataConsulta: catalog.dataUltimaAtualizacao,
    avisos: ativo ? [] : ["NCM não consta na tabela vigente Siscomex (Classif)."],
  };
}

export async function conferirNcmItens(
  siscomex: SiscomexProvider,
  catalog: NcmCatalog,
  itens: EntradaConferenciaNcm[],
): Promise<ConferenciaNcmResult> {
  const siscomexPorIndice = new Map<number, NcmClassificacaoOficial>();

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
  } else {
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i]!;
      const idx = it.indice ?? i;
      const ref = it.ncmPlanilha ?? it.ncmIa;
      if (!ref) continue;
      siscomexPorIndice.set(idx, classificacaoDoCatalogo(catalog, ref));
    }
  }

  const catalogoAtivo = catalog.total > 0;

  const conferidos = conferirLoteNcm(itens, siscomexPorIndice, siscomex.operacional || catalogoAtivo);

  const itensComCompat = conferidos.map((item, i) => {
    const entrada = itens[i]!;
    const ncmRef = item.ncmPlanilha ?? item.ncmIa ?? entrada.ncmPlanilha ?? entrada.ncmIa;
    const descricao = entrada.descricao ?? "";
    if (!ncmRef || !descricao.trim()) return item;
    const { resultado } = avaliarCompatibilidadeProduto(catalog, { descricao, ncm: ncmRef });
    return {
      ...item,
      compatibilidadeProduto: resultado.compatibilidadeProduto,
      motivoCompatibilidade: resultado.motivoCompatibilidade,
    };
  });

  return {
    siscomexConfigurado: siscomex.configurado || catalogoAtivo,
    siscomexOperacional: siscomex.operacional,
    ncmCatalogoTotal: catalog.total,
    itens: itensComCompat,
  };
}
