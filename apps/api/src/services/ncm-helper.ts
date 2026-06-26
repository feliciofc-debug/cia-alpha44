/** Conciliação NCM via Lovable/Gemini — informativa; nunca bloqueia PDF (regra 996c380). */

import type { NcmCatalog } from "@cia/pipeline";
import { ncm8Limpo } from "@cia/shared";
import type { Item } from "@cia/shared";

const SUGERIR_TTL_MS = 30 * 60 * 1000;
const LOOKUP_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

export type ConciliacaoNcmStatus = "coerente" | "divergente" | "sem_sugestao";

export interface NcmHelperSugestao {
  ncm: string;
  descricaoOficial?: string;
  justificativaRGI?: string;
  confianca?: number;
}

export interface NcmHelperAlternativa {
  ncm: string;
  descricaoOficial?: string;
  motivo?: string;
  descricaoCia?: string | null;
}

export interface SugerirNcmResult {
  ok: boolean;
  sugestao?: NcmHelperSugestao & { descricaoCia?: string | null };
  alternativas?: NcmHelperAlternativa[];
  infoQueAjuda?: string;
  erro?: string;
}

export interface LookupNcmResult {
  ok: boolean;
  ncm?: string;
  existe?: boolean;
  descricaoOficial?: string;
  descricaoCia?: string | null;
  capitulo?: string;
  posicao?: string;
  exemplos?: string[];
  observacoes?: string;
  fonte?: "lovable" | "cia-catalog";
  erro?: string;
}

export interface ConciliarNcmResult {
  ok: boolean;
  status: ConciliacaoNcmStatus;
  ncmInformado: string;
  ncmSugerido?: string;
  descricaoSugerida?: string;
  justificativaRGI?: string;
  confianca?: number;
  descricaoCiaInformado?: string | null;
  descricaoCiaSugerido?: string | null;
  alternativas?: NcmHelperAlternativa[];
  infoQueAjuda?: string;
  erro?: string;
}

interface CacheEntry<T> {
  value: T;
  exp: number;
}

const sugerirCache = new Map<string, CacheEntry<SugerirNcmResult>>();
const lookupCache = new Map<string, CacheEntry<LookupNcmResult>>();

function sugerirUrl(): string {
  const direct = process.env.NCM_HELPER_SUGERIR_URL?.trim();
  if (direct) return direct;
  const base = (process.env.NCM_HELPER_BASE_URL ?? "https://ncm-helper-ai.lovable.app").replace(/\/$/, "");
  return `${base}/api/public/sugerir-ncm`;
}

function lookupUrl(): string {
  const direct = process.env.NCM_HELPER_LOOKUP_URL?.trim();
  if (direct) return direct;
  const base = (process.env.NCM_HELPER_BASE_URL ?? "https://ncm-helper-ai.lovable.app").replace(/\/$/, "");
  return `${base}/api/public/lookup-ncm`;
}

function cacheKeySugerir(input: {
  descricao: string;
  material?: string | null;
  uso?: string | null;
  ncmAtual?: string | null;
  max?: number;
  imagemBase64?: string | null;
  imagemMime?: string | null;
}): string {
  return JSON.stringify({
    d: input.descricao.trim().toLowerCase(),
    m: input.material?.trim() ?? "",
    u: input.uso?.trim() ?? "",
    n: ncm8Limpo(input.ncmAtual ?? ""),
    max: input.max ?? 4,
    img: input.imagemBase64 ? `${input.imagemMime ?? "image/jpeg"}:${input.imagemBase64.length}` : "",
  });
}

async function postLovable<T extends { ok?: boolean }>(url: string, body: unknown): Promise<T | { ok: false; erro: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      return { ok: false, erro: `HTTP ${res.status}` };
    }
    if (!ct.includes("application/json")) {
      return { ok: false, erro: "Resposta não-JSON (endpoint indisponível?)" };
    }
    return (await res.json()) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na requisição";
    return { ok: false, erro: msg };
  }
}

function enriquecerCandidato(ncm: string, catalog: NcmCatalog): { ncm: string; descricaoCia: string | null } {
  const key = ncm8Limpo(ncm);
  return { ncm: key, descricaoCia: catalog.descricaoCompleta(key) };
}

/** Chama Lovable sugerir-ncm + referência CIA (catálogo). Nunca lança. */
export async function sugerirNcm(
  input: {
    descricao: string;
    material?: string | null;
    uso?: string | null;
    ncmAtual?: string | null;
    max?: number;
    imagemBase64?: string | null;
    imagemMime?: string | null;
  },
  catalog: NcmCatalog,
): Promise<SugerirNcmResult> {
  const key = cacheKeySugerir(input);
  const hit = sugerirCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;

  const raw = await postLovable<{
    ok: boolean;
    sugestao?: NcmHelperSugestao;
    alternativas?: Array<{ ncm: string; descricaoOficial?: string; motivo?: string }>;
    infoQueAjuda?: string;
    erro?: string;
  }>(sugerirUrl(), {
    descricao: input.descricao,
    material: input.material ?? null,
    uso: input.uso ?? null,
    ncmAtual: input.ncmAtual ? ncm8Limpo(input.ncmAtual) : null,
    max: input.max ?? 4,
    ...(input.imagemBase64
      ? {
          imagem: {
            base64: input.imagemBase64,
            mime: input.imagemMime ?? "image/jpeg",
            regra: "Use a imagem apenas para refinar atributos dentro da família textual; divergência radical deve ser revisão humana.",
          },
        }
      : {}),
  });

  if (!raw.ok || !("sugestao" in raw) || !raw.sugestao?.ncm) {
    const fail: SugerirNcmResult = {
      ok: false,
      erro: ("erro" in raw && raw.erro) || "Sem sugestão da IA",
    };
    sugerirCache.set(key, { value: fail, exp: Date.now() + 60_000 });
    return fail;
  }

  const sugNcm = ncm8Limpo(raw.sugestao.ncm);
  const result: SugerirNcmResult = {
    ok: true,
    sugestao: {
      ...raw.sugestao,
      ncm: sugNcm,
      descricaoCia: catalog.descricaoCompleta(sugNcm),
    },
    alternativas: (raw.alternativas ?? []).map((a) => ({
      ...a,
      ncm: ncm8Limpo(a.ncm),
      descricaoCia: catalog.descricaoCompleta(ncm8Limpo(a.ncm)),
    })),
    infoQueAjuda: raw.infoQueAjuda,
  };

  sugerirCache.set(key, { value: result, exp: Date.now() + SUGERIR_TTL_MS });
  return result;
}

/** Lookup Lovable + fallback catálogo CIA. Nunca lança. */
export async function lookupNcm(ncmRaw: string, catalog: NcmCatalog): Promise<LookupNcmResult> {
  const ncm = ncm8Limpo(ncmRaw);
  if (!ncm || ncm === "00000000") {
    return { ok: false, erro: "NCM inválido (8 dígitos)." };
  }

  const hit = lookupCache.get(ncm);
  if (hit && hit.exp > Date.now()) return hit.value;

  const descricaoCia = catalog.descricaoCompleta(ncm);
  const raw = await postLovable<{
    ok: boolean;
    ncm?: string;
    existe?: boolean;
    descricaoOficial?: string;
    capitulo?: string;
    posicao?: string;
    exemplos?: string[];
    observacoes?: string;
    erro?: string;
  }>(lookupUrl(), { ncm });

  let result: LookupNcmResult;

  if (raw.ok && "ncm" in raw) {
    result = {
      ok: true,
      ncm,
      existe: raw.existe,
      descricaoOficial: raw.descricaoOficial,
      descricaoCia,
      capitulo: raw.capitulo,
      posicao: raw.posicao,
      exemplos: raw.exemplos,
      observacoes: raw.observacoes,
      fonte: "lovable",
    };
  } else if (descricaoCia || catalog.existe(ncm)) {
    result = {
      ok: true,
      ncm,
      existe: catalog.existe(ncm),
      descricaoOficial: descricaoCia ?? catalog.descricao(ncm) ?? undefined,
      descricaoCia,
      fonte: "cia-catalog",
    };
  } else {
    result = {
      ok: false,
      ncm,
      erro: ("erro" in raw && raw.erro) || "Lookup indisponível",
    };
  }

  lookupCache.set(ncm, { value: result, exp: Date.now() + LOOKUP_TTL_MS });
  return result;
}

/** Compara NCM informado pelo usuário vs sugestão IA — informativo only. */
export async function conciliarNcm(
  item: Pick<Item, "descPt" | "descOriginal" | "material" | "uso" | "ncm">,
  catalog: NcmCatalog,
): Promise<ConciliarNcmResult> {
  const ncmInformado = ncm8Limpo(item.ncm ?? "");
  const descricaoCiaInformado = ncmInformado ? catalog.descricaoCompleta(ncmInformado) : null;

  if (!ncmInformado || ncmInformado === "00000000") {
    return {
      ok: true,
      status: "sem_sugestao",
      ncmInformado: item.ncm ?? "",
      descricaoCiaInformado,
      erro: "Informe um NCM de 8 dígitos para conciliar.",
    };
  }

  const sug = await sugerirNcm(
    {
      descricao: (item.descPt || item.descOriginal || "").trim(),
      material: item.material ?? null,
      uso: item.uso ?? null,
      ncmAtual: ncmInformado,
      max: 4,
    },
    catalog,
  );

  if (!sug.ok || !sug.sugestao?.ncm) {
    return {
      ok: true,
      status: "sem_sugestao",
      ncmInformado,
      descricaoCiaInformado,
      alternativas: sug.alternativas,
      infoQueAjuda: sug.infoQueAjuda,
      erro: sug.erro,
    };
  }

  const ncmSugerido = ncm8Limpo(sug.sugestao.ncm);
  const status: ConciliacaoNcmStatus = ncmInformado === ncmSugerido ? "coerente" : "divergente";

  return {
    ok: true,
    status,
    ncmInformado,
    ncmSugerido,
    descricaoSugerida: sug.sugestao.descricaoOficial,
    justificativaRGI: sug.sugestao.justificativaRGI,
    confianca: sug.sugestao.confianca,
    descricaoCiaInformado,
    descricaoCiaSugerido: sug.sugestao.descricaoCia ?? catalog.descricaoCompleta(ncmSugerido),
    alternativas: sug.alternativas,
    infoQueAjuda: sug.infoQueAjuda,
  };
}

/** Limpa cache (testes). */
export function limparCacheNcmHelper(): void {
  sugerirCache.clear();
  lookupCache.clear();
}
