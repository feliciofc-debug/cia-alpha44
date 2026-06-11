import type { Aliquotas, Item } from "./schemas.js";

/** Origem técnica da consulta — estável entre reseeds de cache. */
export type OrigemRastroTributo = "ttce" | "tec-cache" | "manual" | "legado";

export type ChaveTributoRastro = "ii" | "ipi" | "pis" | "cofins";

export const CHAVES_TRIBUTO_RASTRO: ChaveTributoRastro[] = ["ii", "ipi", "pis", "cofins"];

/** Fundamento legal padrão PIS/COFINS importação (Lei 10.865/2004). */
export const PIS_COFINS_FONTE_PADRAO = "Lei 10.865/2004, art. 8º";

/** Rótulo exibido quando o usuário edita a alíquota na cotação. */
export const FONTE_ALIQUOTA_MANUAL = "manual (editado na cotação)";

export interface RastroTributo {
  valor: number;
  origem: OrigemRastroTributo;
  /** Fundamento legal ou rótulo legível — lido do metadata do cache quando origem ≠ manual. */
  fonte: string;
  consultadoEm: string;
  valorOriginal?: number;
  origemOriginal?: OrigemRastroTributo;
  fonteOriginal?: string;
  consultadoEmOriginal?: string;
  editadoEm?: string;
  editadoPor?: string;
}

export type RastroAliquotas = Partial<Record<ChaveTributoRastro, RastroTributo>>;

export function montarRastroTributo(
  valor: number,
  origem: OrigemRastroTributo,
  fonte: string,
  consultadoEm: string,
): RastroTributo {
  return { valor, origem, fonte, consultadoEm };
}

/** Texto de fonte para export/UI — fallback legado quando não há rastro persistido. */
export function fonteExibicaoTributo(
  rastro: RastroTributo | undefined,
  opts?: { legado?: boolean; aliquotasOverride?: boolean },
): string {
  if (rastro?.fonte) return rastro.fonte;
  if (opts?.aliquotasOverride || rastro?.origem === "manual") return FONTE_ALIQUOTA_MANUAL;
  if (opts?.legado !== false) return "legado";
  return "—";
}

export function overrideManualAtivo(rastro: RastroTributo | undefined): boolean {
  return rastro?.origem === "manual";
}

export function itemTemOverrideAliquota(it: Item): boolean {
  if (it.aliquotasOverride) return true;
  const r = it.aliquotasRastro;
  if (!r) return false;
  return CHAVES_TRIBUTO_RASTRO.some((k) => r[k]?.origem === "manual");
}

/** Aplica override manual preservando valor/fonte original (padrão Confirmar NCM). */
export function aplicarOverrideManualAliquota(
  it: Item,
  tributo: ChaveTributoRastro,
  novoValor: number,
  editadoPor?: string | null,
): Item {
  const agora = new Date().toISOString();
  const prev = it.aliquotasRastro?.[tributo];
  const rastroAtual: RastroTributo = prev ?? {
    valor: it.aliquotas[tributo],
    origem: "legado",
    fonte: "legado",
    consultadoEm: agora,
  };

  const rastro: RastroTributo = {
    valor: novoValor,
    origem: "manual",
    fonte: FONTE_ALIQUOTA_MANUAL,
    consultadoEm: agora,
    ...(rastroAtual.origem !== "manual"
      ? {
          valorOriginal: rastroAtual.valor,
          origemOriginal: rastroAtual.origem,
          fonteOriginal: rastroAtual.fonte,
          consultadoEmOriginal: rastroAtual.consultadoEm,
        }
      : {
          valorOriginal: rastroAtual.valorOriginal ?? rastroAtual.valor,
          origemOriginal: rastroAtual.origemOriginal ?? rastroAtual.origem,
          fonteOriginal: rastroAtual.fonteOriginal ?? rastroAtual.fonte,
          consultadoEmOriginal: rastroAtual.consultadoEmOriginal ?? rastroAtual.consultadoEm,
        }),
    editadoEm: agora,
    ...(editadoPor?.trim() ? { editadoPor: editadoPor.trim() } : {}),
  };

  return {
    ...it,
    aliquotas: { ...it.aliquotas, [tributo]: novoValor },
    aliquotasOverride: true,
    aliquotasRastro: { ...it.aliquotasRastro, [tributo]: rastro },
  };
}

/** Mescla rastros TTCE ao vivo sobre cache local. */
export function mesclarRastrosTtce(
  base: RastroAliquotas | undefined,
  live: Partial<Record<ChaveTributoRastro, { valor: number; fonte?: string }>>,
  consultadoEm: string,
): RastroAliquotas {
  const out: RastroAliquotas = { ...base };
  for (const k of CHAVES_TRIBUTO_RASTRO) {
    const patch = live[k];
    if (!patch) continue;
    out[k] = montarRastroTributo(patch.valor, "ttce", patch.fonte ?? "Portal Único TTCE", consultadoEm);
  }
  return out;
}

/** Desfaz override manual de um tributo — restaura valor/fonte original. */
export function desfazerOverrideManualAliquota(it: Item, tributo: ChaveTributoRastro): Item {
  const prev = it.aliquotasRastro?.[tributo];
  if (!prev || prev.origem !== "manual") return it;

  const valorRestaurado = prev.valorOriginal ?? prev.valor;
  const rastroRestaurado: RastroTributo | undefined =
    prev.valorOriginal != null && prev.origemOriginal
      ? {
          valor: valorRestaurado,
          origem: prev.origemOriginal,
          fonte: prev.fonteOriginal ?? "legado",
          consultadoEm: prev.consultadoEmOriginal ?? prev.consultadoEm,
        }
      : undefined;

  const aliquotasRastro = { ...it.aliquotasRastro };
  if (rastroRestaurado) aliquotasRastro[tributo] = rastroRestaurado;
  else delete aliquotasRastro[tributo];

  const aliquotas = { ...it.aliquotas, [tributo]: valorRestaurado };
  const aindaManual = CHAVES_TRIBUTO_RASTRO.some((k) => aliquotasRastro[k]?.origem === "manual");

  return {
    ...it,
    aliquotas,
    aliquotasRastro: Object.keys(aliquotasRastro).length ? aliquotasRastro : undefined,
    aliquotasOverride: aindaManual,
  };
}

/** Formata colunas consultadoEm para export — 1 coluna se datas iguais, 4 se divergirem. */
export function colunasConsultadoEmExport(
  rastros: RastroAliquotas | undefined,
): Record<string, string> {
  const keys = CHAVES_TRIBUTO_RASTRO;
  const vals = keys.map((k) => rastros?.[k]?.consultadoEm).filter(Boolean) as string[];
  if (!vals.length) return { consultadoEm: "—" };

  const unicos = [...new Set(vals.map((v) => v.slice(0, 19)))];
  if (unicos.length === 1) {
    return { consultadoEm: formatarDataConsulta(vals[0]!) };
  }

  const out: Record<string, string> = {};
  for (const k of keys) {
    const col = `consultadoEm${k.toUpperCase()}` as "consultadoEmII" | "consultadoEmIPI" | "consultadoEmPIS" | "consultadoEmCOFINS";
    const map: Record<ChaveTributoRastro, typeof col> = {
      ii: "consultadoEmII",
      ipi: "consultadoEmIPI",
      pis: "consultadoEmPIS",
      cofins: "consultadoEmCOFINS",
    };
    const em = rastros?.[k]?.consultadoEm;
    out[map[k]] = em ? formatarDataConsulta(em) : "—";
  }
  return out;
}

function formatarDataConsulta(iso: string): string {
  const d = iso.slice(0, 19).replace("T", " ");
  return d || iso;
}

/** Monta rastros mínimos legado a partir das alíquotas atuais (cotações salvas sem rastro). */
export function rastrosLegadoFallback(it: Item): RastroAliquotas | undefined {
  if (it.aliquotasRastro && Object.keys(it.aliquotasRastro).length) return it.aliquotasRastro;
  if (!it.aliquotas) return undefined;
  const consultadoEm = new Date(0).toISOString();
  const fonte = it.aliquotasOverride ? FONTE_ALIQUOTA_MANUAL : "legado";
  const origem: OrigemRastroTributo = it.aliquotasOverride ? "manual" : "legado";
  const out: RastroAliquotas = {};
  for (const k of CHAVES_TRIBUTO_RASTRO) {
    out[k] = montarRastroTributo(it.aliquotas[k], origem, fonte, consultadoEm);
  }
  return out;
}

export function rastrosEfetivosItem(it: Item): RastroAliquotas | undefined {
  return it.aliquotasRastro ?? rastrosLegadoFallback(it);
}

/** Aplica patches de alíquotas com rastro manual (batch — API atualizar cotação). */
export function aplicarPatchesAliquotasItem(
  it: Item,
  patch: {
    aliquotas?: Partial<Aliquotas>;
    aliquotasOverride?: boolean;
    desfazerTributos?: ChaveTributoRastro[];
  },
  editadoPor?: string | null,
): Item {
  let atual = it;
  for (const trib of patch.desfazerTributos ?? []) {
    atual = desfazerOverrideManualAliquota(atual, trib);
  }
  if (!patch.aliquotas) return atual;

  for (const k of CHAVES_TRIBUTO_RASTRO) {
    const v = patch.aliquotas[k];
    if (v == null || v === atual.aliquotas[k]) continue;
    atual = aplicarOverrideManualAliquota(atual, k, v, editadoPor);
  }

  if (patch.aliquotasOverride === false && !patch.desfazerTributos?.length) {
    return { ...atual, aliquotasOverride: itemTemOverrideAliquota(atual) };
  }
  return atual;
}
