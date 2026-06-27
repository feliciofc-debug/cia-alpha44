/**
 * Descrição PT (ZH→PT) — planilha fornecedor multilingue modelo;ZH;PT.
 * Formato de exibição: "${modelo} — ${traducaoPT}".
 */

export const AVISO_TRADUCAO_PT_INDISPONIVEL = "traducao-PT-indisponivel";

const RE_CJK =
  /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

export function temCaractereCjk(texto: string): boolean {
  return RE_CJK.test(texto);
}

export function parseModeloFornecedor(descOriginal: string): string {
  const trimmed = descOriginal.trim();
  const primeiro = trimmed.split(";")[0]?.trim();
  if (primeiro && !temCaractereCjk(primeiro) && /^[A-Z0-9][A-Z0-9._/-]*$/i.test(primeiro)) return primeiro;
  const m = trimmed.match(/^([A-Z0-9][A-Z0-9._/-]*)\s*—/i);
  if (m) return m[1]!;
  return "";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function limparPrefixoModelo(modelo: string, texto: string): string {
  const cleaned = texto
    .replace(new RegExp(`^${escapeRe(modelo)}\\s*[—–-]\\s*`, "i"), "")
    .trim();
  return cleaned || texto.trim();
}

/** Tradução PT já presente na planilha (segmento sem CJK após bloco chinês). */
export function extrairTraducaoPtEmbutida(descOriginal: string): string | null {
  const parts = descOriginal
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const modelo = parseModeloFornecedor(descOriginal);
  for (let i = parts.length - 1; i >= 1; i--) {
    const seg = parts[i]!;
    if (!temCaractereCjk(seg)) {
      return limparPrefixoModelo(modelo, seg);
    }
  }
  return null;
}

/** Formato padrão tela / CSV / XLSX / PDF. */
export function formatDescPt(modelo: string, traducaoPt: string): string {
  const mod = modelo.trim();
  const pt = traducaoPt.trim();
  if (!pt) return mod;
  if (!mod) return pt;
  if (new RegExp(`^${escapeRe(mod)}\\s*[—–-]\\s*`, "i").test(pt)) return pt;
  return `${mod} — ${pt}`;
}

export interface ResultadoDescPt {
  descPt: string;
  avisoTraducao?: typeof AVISO_TRADUCAO_PT_INDISPONIVEL;
}

/**
 * Resolve Descrição PT — prioriza PT embutido na planilha, depois candidato (LLM) sem CJK.
 * Fallback honesto: mantém texto disponível + aviso traducao-PT-indisponivel.
 */
export function resolverDescPtFornecedor(
  descOriginal: string,
  candidato?: string | null,
): ResultadoDescPt {
  const modelo = parseModeloFornecedor(descOriginal);
  const embutida = extrairTraducaoPtEmbutida(descOriginal);
  if (embutida) {
    return { descPt: formatDescPt(modelo, embutida) };
  }

  const cand = candidato?.trim();
  if (cand && !temCaractereCjk(cand)) {
    return { descPt: formatDescPt(modelo, limparPrefixoModelo(modelo, cand)) };
  }

  const parts = descOriginal
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const zh =
    parts.find((p, i) => i > 0 && temCaractereCjk(p)) ??
    (temCaractereCjk(descOriginal) ? descOriginal.trim() : "");

  if (zh) {
    return {
      descPt: formatDescPt(modelo, zh),
      avisoTraducao: AVISO_TRADUCAO_PT_INDISPONIVEL,
    };
  }

  const fallback = cand || descOriginal.trim();
  return {
    descPt: formatDescPt(modelo, limparPrefixoModelo(modelo, fallback)),
    ...(temCaractereCjk(fallback) ? { avisoTraducao: AVISO_TRADUCAO_PT_INDISPONIVEL } : {}),
  };
}
