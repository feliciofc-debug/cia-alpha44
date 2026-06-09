/** Monta contexto Siscomex (NCMs vigentes) para a IA classificar com base oficial. */

import type { NcmCatalog } from "@cia/pipeline";
import { detectarFamilia, enriquecerTextoClassificacao } from "@cia/pipeline";

export function contextoSiscomexParaItem(catalog: NcmCatalog, descricao: string, ncmInformado?: string | null): string {
  const familia = detectarFamilia(descricao);
  const cap = ncmInformado?.replace(/\D/g, "").slice(0, 4);
  const capBusca = familia?.capitulo ?? (cap && cap.length === 4 ? cap : undefined);
  const texto = enriquecerTextoClassificacao(descricao, familia);
  const hits = catalog.buscarPorTexto(texto, capBusca, 8);
  if (!hits.length) {
    return `Tabela Siscomex vigente (${catalog.total} NCMs, atualizada ${catalog.dataUltimaAtualizacao ?? "—"}). Nenhum candidato automático — aplique RGI e deixe ncmCandidatos vazio se incerto.`;
  }
  const linhas = hits.map((h) => `- ${h.ncm}: ${h.descricao.slice(0, 120)}`);
  const famHint = familia
    ? `Família detectada: ${familia.id} (capítulo ${familia.capitulo}) — escolha SOMENTE NCMs deste capítulo se coerente com o produto.`
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
