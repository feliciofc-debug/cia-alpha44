/**
 * P2c v1.1 — Conversão EUR→US$ aplicada NA INGESTÃO.
 */

import type { LinhaCrua, ParsedSupplierFile } from "@cia/pipeline";
import { avisoMoedaEurConvertida, normalizarMoedaCodigo } from "@cia/shared";
import { buscarCambioEurUsd } from "./cambio-eur-usd.js";

type ParsedConversivel = Pick<
  ParsedSupplierFile,
  "linhas" | "avisos" | "moedaPlanilha" | "cambioEurUsd" | "cambioEurUsdData" | "cambioEurUsdFonte"
>;

export async function converterLinhasEurParaUsd<T extends ParsedConversivel>(
  parsed: T,
): Promise<T> {
  const moeda = normalizarMoedaCodigo(parsed.moedaPlanilha ?? null);
  if (moeda !== "EUR") {
    return parsed;
  }

  if (parsed.cambioEurUsd != null && parsed.cambioEurUsd > 0) {
    return parsed;
  }

  const cross = await buscarCambioEurUsd();
  if (cross.fonte === "indisponível" || cross.cambioEurUsd == null || cross.cambioEurUsd <= 0) {
    return {
      ...parsed,
      cambioEurUsd: null,
      cambioEurUsdData: null,
      cambioEurUsdFonte: "indisponível",
    };
  }

  const taxa = cross.cambioEurUsd;
  const linhasConvertidas: LinhaCrua[] = parsed.linhas.map((l) => ({
    ...l,
    fobUnitarioUS: l.fobUnitarioUS != null ? l.fobUnitarioUS * taxa : l.fobUnitarioUS,
    fobTotalUS: l.fobTotalUS != null ? l.fobTotalUS * taxa : l.fobTotalUS,
  }));

  const avisoV11 = avisoMoedaEurConvertida(taxa, cross.dataCotacao);
  const avisos = parsed.avisos.filter(
    (a) => !a.includes("tratados como US$") && !a.includes("não foram convertidos"),
  );
  if (!avisos.includes(avisoV11)) avisos.unshift(avisoV11);

  return {
    ...parsed,
    linhas: linhasConvertidas,
    avisos,
    cambioEurUsd: taxa,
    cambioEurUsdData: cross.dataCotacao,
    cambioEurUsdFonte: cross.fonte,
  };
}
