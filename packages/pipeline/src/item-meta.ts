import type { Item } from "@cia/shared";

/** Campos estendidos do item não mapeados 1:1 nas colunas Prisma. */
export interface ItemMetaPersistido {
  uso?: string;
  material?: string;
  ncmFonte?: Item["ncmFonte"];
  ncmConfianca?: number;
  ncmValido?: boolean;
  ncmDescricaoOficial?: string;
  ncmPlanilhaOriginal?: string;
  ncmAvisos?: string[];
  compatibilidadeProduto?: Item["compatibilidadeProduto"];
  motivoCompatibilidade?: string;
  fobKgFonte?: string;
  fobPendente?: boolean;
  fobKgBase?: Item["fobKgBase"];
  fobKgAvisos?: string[];
  ncmRevisadoHumano?: boolean;
  ncmRevisadoEm?: string;
  ncmConfirmado?: string;
  ncmConfirmadoPor?: string;
  aliquotasRastro?: Item["aliquotasRastro"];
}

export function extrairItemMeta(it: Item): ItemMetaPersistido {
  return {
    uso: it.uso,
    material: it.material,
    ncmFonte: it.ncmFonte,
    ncmConfianca: it.ncmConfianca,
    ncmValido: it.ncmValido,
    ncmDescricaoOficial: it.ncmDescricaoOficial,
    ncmPlanilhaOriginal: it.ncmPlanilhaOriginal,
    ncmAvisos: it.ncmAvisos,
    compatibilidadeProduto: it.compatibilidadeProduto,
    motivoCompatibilidade: it.motivoCompatibilidade,
    fobKgFonte: it.fobKgFonte,
    fobPendente: it.fobPendente,
    fobKgBase: it.fobKgBase,
    fobKgAvisos: it.fobKgAvisos,
    ncmRevisadoHumano: it.ncmRevisadoHumano,
    ncmRevisadoEm: it.ncmRevisadoEm,
    ncmConfirmado: it.ncmConfirmado,
    ncmConfirmadoPor: it.ncmConfirmadoPor,
    aliquotasRastro: it.aliquotasRastro,
  };
}

export function mesclarItemMeta(it: Item, meta: unknown): Item {
  if (!meta || typeof meta !== "object") return it;
  const m = meta as ItemMetaPersistido;
  return {
    ...it,
    ...(m.uso != null ? { uso: m.uso } : {}),
    ...(m.material != null ? { material: m.material } : {}),
    ...(m.ncmFonte != null ? { ncmFonte: m.ncmFonte } : {}),
    ...(m.ncmConfianca != null ? { ncmConfianca: m.ncmConfianca } : {}),
    ...(m.ncmValido != null ? { ncmValido: m.ncmValido } : {}),
    ...(m.ncmDescricaoOficial != null ? { ncmDescricaoOficial: m.ncmDescricaoOficial } : {}),
    ...(m.ncmPlanilhaOriginal != null ? { ncmPlanilhaOriginal: m.ncmPlanilhaOriginal } : {}),
    ...(m.ncmAvisos != null ? { ncmAvisos: m.ncmAvisos } : {}),
    ...(m.compatibilidadeProduto != null ? { compatibilidadeProduto: m.compatibilidadeProduto } : {}),
    ...(m.motivoCompatibilidade != null ? { motivoCompatibilidade: m.motivoCompatibilidade } : {}),
    ...(m.fobKgFonte != null ? { fobKgFonte: m.fobKgFonte } : {}),
    ...(m.fobPendente != null ? { fobPendente: m.fobPendente } : {}),
    ...(m.fobKgBase != null ? { fobKgBase: m.fobKgBase } : {}),
    ...(m.fobKgAvisos != null ? { fobKgAvisos: m.fobKgAvisos } : {}),
    ...(m.ncmRevisadoHumano != null ? { ncmRevisadoHumano: m.ncmRevisadoHumano } : {}),
    ...(m.ncmRevisadoEm != null ? { ncmRevisadoEm: m.ncmRevisadoEm } : {}),
    ...(m.ncmConfirmado != null ? { ncmConfirmado: m.ncmConfirmado } : {}),
    ...(m.ncmConfirmadoPor != null ? { ncmConfirmadoPor: m.ncmConfirmadoPor } : {}),
    ...(m.aliquotasRastro != null ? { aliquotasRastro: m.aliquotasRastro } : {}),
  };
}

