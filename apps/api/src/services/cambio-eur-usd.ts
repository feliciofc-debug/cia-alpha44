/**
 * P2c v1.1 — Câmbio cross EUR→US$ derivado da PTAX (Banco Central, Olinda).
 *
 * Decisão travada: cross = (EUR/BRL) ÷ (USD/BRL), ambos PTAX VENDA, MESMA dataCotacao.
 * Sem usar o boletim de paridade direto do BCB (evita validar endpoint extra).
 *
 * Reusa buscarCambioPtax (cambio.ts), que já trata o recuo de até 7 dias úteis.
 * Aqui garantimos que as duas pernas (EUR e USD) caiam na MESMA data — se a
 * primeira tentativa divergir, recuamos juntos dia a dia até bater a data.
 *
 * Fallback: se qualquer perna vier "indisponível" ou não houver data comum,
 * retorna fonte "indisponível" e cambioEurUsd null → ingestão NÃO converte
 * (mantém aviso v1 atual). Conversão só acontece com taxa confiável.
 */

import { buscarCambioPtax } from "./cambio.js";

export interface CambioEurUsdResult {
  /** Taxa EUR→US$ (quantos US$ vale 1 EUR). null quando indisponível. */
  cambioEurUsd: number | null;
  /** Data do boletim PTAX usado em AMBAS as pernas (YYYY-MM-DD ou ISO do BCB). */
  dataCotacao: string | null;
  fonte: "PTAX-cross" | "indisponível";
  /** Pernas brutas, para auditoria/log. */
  eurBrl: number | null;
  usdBrl: number | null;
}

/** Normaliza a data do BCB (dataHoraCotacao "YYYY-MM-DD HH:MM:SS...") para o dia. */
function diaDe(dataCotacao: string | null): string | null {
  if (!dataCotacao) return null;
  return dataCotacao.slice(0, 10);
}

export async function buscarCambioEurUsd(): Promise<CambioEurUsdResult> {
  const indisponivel: CambioEurUsdResult = {
    cambioEurUsd: null,
    dataCotacao: null,
    fonte: "indisponível",
    eurBrl: null,
    usdBrl: null,
  };

  const [eur, usd] = await Promise.all([buscarCambioPtax("EUR"), buscarCambioPtax("USD")]);

  if (eur.fonte === "indisponível" || usd.fonte === "indisponível") {
    return indisponivel;
  }
  if (eur.cotacaoVenda == null || usd.cotacaoVenda == null || usd.cotacaoVenda <= 0) {
    return indisponivel;
  }

  const diaEur = diaDe(eur.dataCotacao);
  const diaUsd = diaDe(usd.dataCotacao);

  if (diaEur && diaUsd && diaEur === diaUsd) {
    const cambioEurUsd = eur.cotacaoVenda / usd.cotacaoVenda;
    return {
      cambioEurUsd,
      dataCotacao: diaEur,
      fonte: "PTAX-cross",
      eurBrl: eur.cotacaoVenda,
      usdBrl: usd.cotacaoVenda,
    };
  }

  return indisponivel;
}
