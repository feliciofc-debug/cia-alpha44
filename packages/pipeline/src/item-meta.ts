import type { Item } from "@cia/shared";

/** Campos estendidos do item não mapeados 1:1 nas colunas Prisma. */
export interface ItemMetaPersistido {
  uso?: string;
  material?: string;
  ncmFonte?: Item["ncmFonte"];
  ncmClassificacaoCache?: Item["ncmClassificacaoCache"];
  ncmConfianca?: number;
  ncmValido?: boolean;
  ncmDescricaoOficial?: string;
  ncmPlanilhaOriginal?: string;
  /** NCM da coluna embarque no upload — sempre persistido, independente do classificador. */
  ncmEmbarque?: string | null;
  ncmEmbarqueStatus?: "coluna" | "heranca-familia" | "sem-ncm-coluna";
  /** NCM de gabarito/patch — referência para conferência, não declaração do cliente. */
  ncmReferencia?: string;
  ncmAvisos?: string[];
  compatibilidadeProduto?: Item["compatibilidadeProduto"];
  motivoCompatibilidade?: string;
  /** ID da família de produto (detectarFamilia) persistida na classificação. */
  familiaProdutoId?: string;
  fobKgFonte?: string;
  fobEmbarqueUS?: number;
  fobPendente?: boolean;
  fobKgBase?: Item["fobKgBase"];
  fobKgAvisos?: string[];
  ncmRevisadoHumano?: boolean;
  ncmRevisadoEm?: string;
  ncmConfirmado?: string;
  ncmConfirmadoPor?: string;
  aliquotasRastro?: Item["aliquotasRastro"];
}

/** Rótulo honesto para NCM injetado (patch/gabarito) — não é declaração do cliente. */
export function avisoNcmReferencia(ncm: string): string {
  return `NCM de referência — conferir: ${ncm}.`;
}

/** NCM legado injetado sem coluna real na planilha de embarque. */
export function referenciaNcmLegado(meta: ItemMetaPersistido): string | null {
  if (meta.ncmReferencia?.trim()) return meta.ncmReferencia.trim();
  if (meta.ncmEmbarqueStatus === "sem-ncm-coluna") {
    const legado = meta.ncmPlanilhaOriginal ?? meta.ncmEmbarque ?? null;
    return legado?.trim() ? legado.trim() : null;
  }
  return null;
}

/**
 * NCM da coluna embarque para Camada A (planilha-cliente).
 * Meta injetado sem coluna real → null (classificador IA/Siscomex).
 */
export function ncmColunaEmbarqueParaClassificacao(
  meta: ItemMetaPersistido,
  opts?: { ncmConfirmadoHumano?: string | null },
): string | null {
  if (opts?.ncmConfirmadoHumano?.trim()) return opts.ncmConfirmadoHumano.trim();
  if (meta.ncmEmbarqueStatus === "coluna") {
    return meta.ncmEmbarque ?? meta.ncmPlanilhaOriginal ?? null;
  }
  if (meta.ncmEmbarqueStatus === "heranca-familia") {
    return meta.ncmEmbarque ?? null;
  }
  return null;
}

export function extrairItemMeta(it: Item): ItemMetaPersistido {
  return {
    uso: it.uso,
    material: it.material,
    ncmFonte: it.ncmFonte,
    ncmClassificacaoCache: it.ncmClassificacaoCache,
    ncmConfianca: it.ncmConfianca,
    ncmValido: it.ncmValido,
    ncmDescricaoOficial: it.ncmDescricaoOficial,
    ncmPlanilhaOriginal: it.ncmPlanilhaOriginal,
    ncmEmbarque: it.ncmEmbarque ?? null,
    ncmEmbarqueStatus: it.ncmEmbarqueStatus,
    ncmReferencia: it.ncmReferencia,
    ncmAvisos: it.ncmAvisos,
    compatibilidadeProduto: it.compatibilidadeProduto,
    motivoCompatibilidade: it.motivoCompatibilidade,
    familiaProdutoId: (it as Item & { familiaProdutoId?: string }).familiaProdutoId,
    fobKgFonte: it.fobKgFonte,
    fobEmbarqueUS: it.fobEmbarqueUS,
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
  const semColuna = m.ncmEmbarqueStatus === "sem-ncm-coluna";
  const refLegado = referenciaNcmLegado(m);
  const avisosBase = [...(it.ncmAvisos ?? []), ...(m.ncmAvisos ?? [])];
  const avisosRef =
    refLegado && semColuna && !avisosBase.some((a) => a.includes("referência"))
      ? [...avisosBase, avisoNcmReferencia(refLegado)]
      : avisosBase.length
        ? avisosBase
        : undefined;
  return {
    ...it,
    ...(m.uso != null ? { uso: m.uso } : {}),
    ...(m.material != null ? { material: m.material } : {}),
    ...(m.ncmFonte != null ? { ncmFonte: m.ncmFonte } : {}),
    ...(m.ncmClassificacaoCache != null ? { ncmClassificacaoCache: m.ncmClassificacaoCache } : {}),
    ...(m.ncmConfianca != null ? { ncmConfianca: m.ncmConfianca } : {}),
    ...(m.ncmValido != null ? { ncmValido: m.ncmValido } : {}),
    ...(m.ncmDescricaoOficial != null ? { ncmDescricaoOficial: m.ncmDescricaoOficial } : {}),
    ...(!semColuna && m.ncmPlanilhaOriginal != null ? { ncmPlanilhaOriginal: m.ncmPlanilhaOriginal } : {}),
    ...(m.ncmEmbarqueStatus != null ? { ncmEmbarqueStatus: m.ncmEmbarqueStatus } : {}),
    ...(semColuna
      ? { ncmEmbarque: null }
      : m.ncmEmbarque != null
        ? { ncmEmbarque: m.ncmEmbarque }
        : {}),
    ...(refLegado && semColuna ? { ncmReferencia: refLegado } : m.ncmReferencia != null ? { ncmReferencia: m.ncmReferencia } : {}),
    ...(avisosRef ? { ncmAvisos: avisosRef } : {}),
    ...(m.compatibilidadeProduto != null ? { compatibilidadeProduto: m.compatibilidadeProduto } : {}),
    ...(m.motivoCompatibilidade != null ? { motivoCompatibilidade: m.motivoCompatibilidade } : {}),
    ...(m.familiaProdutoId != null ? { familiaProdutoId: m.familiaProdutoId } : {}),
    ...(m.fobKgFonte != null ? { fobKgFonte: m.fobKgFonte } : {}),
    ...(m.fobEmbarqueUS != null ? { fobEmbarqueUS: m.fobEmbarqueUS } : {}),
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

