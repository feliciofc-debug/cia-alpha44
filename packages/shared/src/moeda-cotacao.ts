/** Aviso v1 — planilha EUR, cotação em US$ sem conversão. */
export const AVISO_MOEDA_EUR_V1 =
  "Valores da planilha em EUR tratados como US$ — conversão pendente";

export function normalizarMoedaCodigo(m?: string | null): string | null {
  if (!m?.trim()) return null;
  const u = m.trim().toUpperCase();
  if (/EUR|€/.test(u)) return "EUR";
  if (/USD|US\$|U\.S\.D/.test(u)) return "US$";
  if (/BRL|R\$|REAL/.test(u)) return "R$";
  return m.trim();
}

/** Retorna aviso EUR v1 quando planilha ≠ moeda da cotação (tipicamente EUR vs US$). */
export function avisoMoedaEurSeAplicavel(
  moedaPlanilha?: string | null,
  moedaCotacao = "US$",
): string | null {
  const mp = normalizarMoedaCodigo(moedaPlanilha);
  const mc = normalizarMoedaCodigo(moedaCotacao) ?? "US$";
  if (!mp || mp === mc) return null;
  if (mp === "EUR" && mc === "US$") return AVISO_MOEDA_EUR_V1;
  return `Moeda da planilha (${mp}) difere da moeda da cotação (${mc}) — valores importados não foram convertidos.`;
}

/** Garante aviso EUR no topo de avisosFiscais (idempotente). */
export function mesclarAvisoMoedaCotacao<T extends { moeda?: string; moedaPlanilha?: string | null; avisosFiscais?: string[] }>(
  cotacao: T,
): T {
  const aviso = avisoMoedaEurSeAplicavel(cotacao.moedaPlanilha, cotacao.moeda);
  if (!aviso) return cotacao;
  const avisos = [...(cotacao.avisosFiscais ?? [])];
  if (!avisos.includes(aviso)) avisos.unshift(aviso);
  return { ...cotacao, avisosFiscais: avisos };
}
