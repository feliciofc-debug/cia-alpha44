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

/** Aviso v1.1 — FOB convertido EUR→US$ via PTAX cross. */
export function avisoMoedaEurConvertida(taxa: number, dataCotacao: string | null): string {
  const taxaFmt = taxa.toFixed(4);
  const dataFmt = dataCotacao?.trim() || "—";
  return `Valores da planilha convertidos de EUR para US$ (PTAX venda cross ${taxaFmt}, data ${dataFmt}).`;
}

export interface CotacaoMoedaAvisoInput {
  moeda?: string;
  moedaPlanilha?: string | null;
  cambioEurUsd?: number | null;
  cambioEurUsdData?: string | null;
}

/** Retorna aviso de moeda para exibição (v1.1 se convertido, senão v1 ou genérico). */
export function avisoMoedaCotacao(cotacao: CotacaoMoedaAvisoInput): string | null {
  const mp = normalizarMoedaCodigo(cotacao.moedaPlanilha);
  const mc = normalizarMoedaCodigo(cotacao.moeda) ?? "US$";
  if (!mp || mp === mc) return null;
  if (mp === "EUR" && mc === "US$") {
    if (cotacao.cambioEurUsd != null && cotacao.cambioEurUsd > 0) {
      return avisoMoedaEurConvertida(cotacao.cambioEurUsd, cotacao.cambioEurUsdData ?? null);
    }
    return AVISO_MOEDA_EUR_V1;
  }
  return `Moeda da planilha (${mp}) difere da moeda da cotação (${mc}) — valores importados não foram convertidos.`;
}

/** @deprecated use avisoMoedaCotacao */
export function avisoMoedaEurSeAplicavel(
  moedaPlanilha?: string | null,
  moedaCotacao = "US$",
  cambioEurUsd?: number | null,
  cambioEurUsdData?: string | null,
): string | null {
  return avisoMoedaCotacao({ moedaPlanilha, moeda: moedaCotacao, cambioEurUsd, cambioEurUsdData });
}

/** Garante aviso EUR no topo de avisosFiscais (idempotente). */
export function mesclarAvisoMoedaCotacao<
  T extends {
    moeda?: string;
    moedaPlanilha?: string | null;
    avisosFiscais?: string[];
    cambioEurUsd?: number | null;
    cambioEurUsdData?: string | null;
  },
>(cotacao: T): T {
  const aviso = avisoMoedaCotacao(cotacao);
  if (!aviso) return cotacao;
  const avisos = [...(cotacao.avisosFiscais ?? [])].filter(
    (a) =>
      a !== AVISO_MOEDA_EUR_V1 &&
      !a.includes("tratados como US$") &&
      !a.includes("convertidos de EUR para US$"),
  );
  if (!avisos.includes(aviso)) avisos.unshift(aviso);
  return { ...cotacao, avisosFiscais: avisos };
}
