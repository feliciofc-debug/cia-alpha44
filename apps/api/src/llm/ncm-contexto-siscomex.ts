import { detectarFamilias, prefixoBuscaPrincipal, enriquecerTextoClassificacao } from "@cia/pipeline";
import type { NcmCatalog } from "@cia/pipeline";

const LIMIAR_BUSCA_RGI = 0.5;

export function contextoSiscomexParaItem(catalog: NcmCatalog, descricao: string, ncmInformado?: string | null): string {
  const deteccao = detectarFamilias(descricao);
  const familia = deteccao.conflito ? null : (deteccao.familias[0]?.familia ?? null);
  const cap = ncmInformado?.replace(/\D/g, "").slice(0, 4);
  const capBusca = prefixoBuscaPrincipal(familia) ?? (cap && cap.length === 4 ? cap : undefined);
  const texto = enriquecerTextoClassificacao(descricao, familia);
  const hits = catalog.buscarPorTexto(texto, capBusca, 8);
  const melhorScore = hits[0]?.score ?? 0;

  if (!hits.length || melhorScore < LIMIAR_BUSCA_RGI) {
    const capHint = deteccao.conflito
      ? deteccao.avisoConflito
      : familia
        ? `Guard-rail: prefixos ${familia.prefixos.join("/")} (${familia.id}).`
        : capBusca
          ? `Posição sugerida pela planilha: ${capBusca}.`
          : "";
    return [
      `Tabela Siscomex vigente (${catalog.total} NCMs, atualizada ${catalog.dataUltimaAtualizacao ?? "—"}).`,
      `Busca automática fraca (score ${melhorScore.toFixed(2)} < ${LIMIAR_BUSCA_RGI}) — aplique RGI 1–6 e sugira NCM dentro do capítulo coerente.`,
      capHint,
      "PROIBIDO usar códigos fora da tabela vigente Siscomex.",
      ncmInformado
        ? `NCM informado na planilha: ${ncmInformado} (${catalog.existe(ncmInformado) ? "VÁLIDO" : "INVÁLIDO/desatualizado — busque substituto vigente"})`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const linhas = hits.map((h) => `- ${h.ncm}: ${h.descricao.slice(0, 120)}`);
  const famHint = deteccao.conflito
    ? deteccao.avisoConflito
    : familia
      ? `Família detectada: ${familia.id} (prefixos ${familia.prefixos.join("/")}) — escolha SOMENTE NCMs coerentes se aplicável.`
      : "";
  return [
    `NCMs VIGENTES Siscomex compatíveis (escolha SOMENTE entre estes):`,
    famHint,
    ...linhas,
    ncmInformado ? `NCM informado na planilha: ${ncmInformado} (${catalog.existe(ncmInformado) ? "VÁLIDO na tabela" : "INVÁLIDO/desatualizado — NÃO use; busque substituto no mesmo capítulo"})` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
