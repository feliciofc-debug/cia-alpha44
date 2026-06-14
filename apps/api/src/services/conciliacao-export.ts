/** Exportação de relatório de conciliação (XLSX/CSV). */

import type { Cotacao, Item } from "@cia/shared";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import {
  gerarConciliacaoBuffer,
  mesclarItemMeta,
  nomeArquivoConciliacao,
  type RelatorioConciliacaoInput,
} from "@cia/pipeline";
import type { AppState } from "../state.js";
import { calcularCotacao } from "./cotacao.js";
import { buscarCotacao } from "./cotacoes-persist.js";

export interface ConciliacaoExportInput {
  cotacao: Cotacao;
  itens: Item[];
  resultado?: ResultadoCotacao | null;
  provider?: string | null;
  cotacaoId?: string | null;
}

function enriquecerItensConciliacao(
  cotacao: Cotacao,
  itens: Item[],
  state: AppState,
  resultado?: ResultadoCotacao | null,
): { itens: Item[]; resultado: ResultadoCotacao | null } {
  const cot: Cotacao = { ...cotacao, itens };
  const calc = calcularCotacao(cot, state);
  return {
    itens: calc.itens,
    resultado: resultado ?? calc.resultado,
  };
}

export async function exportarConciliacao(
  input: ConciliacaoExportInput,
  formato: "xlsx" | "csv",
  state: AppState,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const { itens, resultado } = enriquecerItensConciliacao(
    input.cotacao,
    input.itens,
    state,
    input.resultado,
  );
  const rel: RelatorioConciliacaoInput = {
    cotacao: input.cotacao,
    itens,
    resultado,
    provider: input.provider,
    cotacaoId: input.cotacaoId,
  };
  const buffer = await gerarConciliacaoBuffer(rel, formato);
  const base = nomeArquivoConciliacao(
    input.cotacao.cliente,
    input.cotacaoId ?? input.cotacao.id,
  );
  const filename = `${base}.${formato}`;
  const contentType =
    formato === "csv"
      ? "text/csv; charset=utf-8"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return { buffer, filename, contentType };
}

export async function exportarConciliacaoSalva(
  id: string,
  tenantSlug: string,
  formato: "xlsx" | "csv",
  state: AppState,
) {
  const row = await buscarCotacao(id, tenantSlug);
  if (!row) return null;
  return exportarConciliacao(
    {
      cotacao: row.cotacao,
      itens: row.itens,
      resultado: row.resultado,
      provider: row.provider,
      cotacaoId: id,
    },
    formato,
    state,
  );
}

/** Mescla meta persistido ao recarregar item parcial (uso interno). */
export { mesclarItemMeta };
