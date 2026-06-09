/** Monta contexto Siscomex (NCMs vigentes) para a IA classificar com base oficial. */

import type { NcmCatalog } from "@cia/pipeline";

export function contextoSiscomexParaItem(catalog: NcmCatalog, descricao: string, ncmInformado?: string | null): string {
  const cap = ncmInformado?.replace(/\D/g, "").slice(0, 4);
  const hits = catalog.buscarPorTexto(descricao, cap && cap.length === 4 ? cap : undefined, 8);
  if (!hits.length) {
    return `Tabela Siscomex vigente (${catalog.total} NCMs, atualizada ${catalog.dataUltimaAtualizacao ?? "—"}). Nenhum candidato automático — aplique RGI e deixe ncmCandidatos vazio se incerto.`;
  }
  const linhas = hits.map((h) => `- ${h.ncm}: ${h.descricao.slice(0, 120)}`);
  return [
    `NCMs VIGENTES Siscomex compatíveis (escolha SOMENTE entre estes):`,
    ...linhas,
    ncmInformado ? `NCM informado na planilha: ${ncmInformado} (${catalog.existe(ncmInformado) ? "VÁLIDO na tabela" : "INVÁLIDO/desatualizado — não use se incoerente"})` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
