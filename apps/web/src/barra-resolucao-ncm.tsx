import { useMemo, useState } from "react";
import type { Item } from "./lib/types.ts";
import { fmtNcm } from "./lib/format.ts";
import {
  itemPodeConfirmarNcmIndividual,
  itemPodeDesfazerNcm,
  itensPendentesConfirmacaoNcm,
  itensResolucaoNcm,
} from "./lib/ncm.ts";

function motivoItem(it: Item): string {
  if (it.compatibilidadeProduto === "incompativel") return "NCM × produto incompatível";
  if (it.compatibilidadeProduto === "revisar") return "Revisar compatibilidade";
  if (it.ncmValido === false) return "NCM inválido";
  if (it.ncmFonte === "pendente") return "NCM pendente";
  if (it.ncmConfianca != null && it.ncmConfianca < 0.85) {
    return `Baixa confiança (${(it.ncmConfianca * 100).toFixed(0)}%)`;
  }
  return "Pendência NCM";
}

export function BarraResolucaoNcm({
  itens,
  aberta,
  onToggle,
  onConfirmarNcm,
  onConfirmarTodosNcm,
  confirmandoTodosNcm,
  resumoNcmLote,
  onDesfazerNcm,
  onAlterarNcm,
  confirmandoNcm,
  alterandoNcm,
}: {
  itens: Item[];
  aberta: boolean;
  onToggle: () => void;
  onConfirmarNcm: (idx: number) => void | Promise<void>;
  onConfirmarTodosNcm?: () => void | Promise<void>;
  confirmandoTodosNcm?: boolean;
  resumoNcmLote?: { aprovados: number; pendentes: number } | null;
  onDesfazerNcm?: (idx: number) => void | Promise<void>;
  onAlterarNcm: (idx: number, ncm: string) => void | Promise<void>;
  confirmandoNcm?: number | null;
  alterandoNcm?: number | null;
}) {
  const fila = useMemo(() => itensResolucaoNcm(itens), [itens]);
  const elegiveis = useMemo(() => itensPendentesConfirmacaoNcm(itens).length, [itens]);
  const operacaoBloqueada = Boolean(
    confirmandoTodosNcm || confirmandoNcm != null || alterandoNcm != null,
  );

  const [draftNcm, setDraftNcm] = useState<Record<number, string>>({});

  if (!fila.length && !resumoNcmLote) return null;

  return (
    <div
      id="barra-resolucao-ncm"
      className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 shadow-lg shadow-amber-900/20"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          onClick={onToggle}
        >
          {aberta ? "▲ Ocultar resolução" : `▶ Resolver pendências (${fila.length})`}
        </button>
        {elegiveis > 0 && onConfirmarTodosNcm && (
          <button
            type="button"
            className="rounded-lg border-2 border-emerald-400/60 bg-emerald-500/20 px-4 py-2.5 text-sm font-bold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
            disabled={operacaoBloqueada}
            onClick={() => void onConfirmarTodosNcm()}
          >
            {confirmandoTodosNcm
              ? "Aprovando…"
              : `Aprovar todos os NCMs válidos (${elegiveis})`}
          </button>
        )}
        <p className="text-sm text-amber-100">
          {fila.length} item{fila.length === 1 ? "" : "s"} bloqueando ou aguardando confirmação de NCM
        </p>
      </div>

      {resumoNcmLote && (
        <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {resumoNcmLote.aprovados} aprovado{resumoNcmLote.aprovados === 1 ? "" : "s"} ·{" "}
          {resumoNcmLote.pendentes} pendente{resumoNcmLote.pendentes === 1 ? "" : "s"} (precisam de NCM/edição
          manual)
        </p>
      )}

      {aberta && (
        <ul className="mt-4 max-h-[24rem] space-y-3 overflow-y-auto">
          {fila.map(({ idx, item: it }: { idx: number; item: Item }) => {
            const desc = (it.descPt || it.descOriginal || "Item").slice(0, 72);
            const draft = draftNcm[idx] ?? (it.ncm || "").replace(/\D/g, "").slice(0, 8);
            const podeConfirmar = itemPodeConfirmarNcmIndividual(it);
            const podeDesfazer = itemPodeDesfazerNcm(it);
            const editando = alterandoNcm === idx;
            const confirmando = confirmandoNcm === idx;

            return (
              <li
                key={idx}
                id={`resolucao-ncm-item-${idx}`}
                className="rounded-lg border border-white/15 bg-ink-900/80 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-400">Item #{idx + 1}</p>
                    <p className="font-medium text-white">{desc}</p>
                    <p className="mt-1 text-xs text-amber-300">◐ {motivoItem(it)}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      NCM atual: <span className="font-mono text-emerald-300">{fmtNcm(it.ncm || "00000000")}</span>
                    </p>
                    {podeDesfazer && (
                      <p className="mt-1 text-xs font-medium text-emerald-400">
                        ✓ Confirmado{it.ncmConfirmadoPor ? ` · ${it.ncmConfirmadoPor}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end">
                    {podeConfirmar && (
                      <button
                        type="button"
                        className="min-w-[9rem] rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                        disabled={operacaoBloqueada}
                        onClick={() => void onConfirmarNcm(idx)}
                      >
                        {confirmando
                          ? "Confirmando…"
                          : it.compatibilidadeProduto === "incompativel"
                            ? "Confirmar NCM (override)"
                            : "Confirmar NCM"}
                      </button>
                    )}
                    {podeDesfazer && onDesfazerNcm && (
                      <button
                        type="button"
                        className="rounded-lg bg-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-500 disabled:opacity-50"
                        disabled={operacaoBloqueada}
                        onClick={() => void onDesfazerNcm(idx)}
                      >
                        Desfazer
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
                  <label className="text-xs text-slate-400">
                    Editar NCM
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      className="mt-1 block w-36 rounded border border-white/20 bg-ink-800 px-2 py-2 font-mono text-sm text-white"
                      value={draft}
                      disabled={operacaoBloqueada}
                      onChange={(e) =>
                        setDraftNcm((prev) => ({
                          ...prev,
                          [idx]: e.target.value.replace(/\D/g, "").slice(0, 8),
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg border border-brand-500/50 bg-brand-500/20 px-4 py-2 text-sm font-semibold text-brand-200 hover:bg-brand-500/30 disabled:opacity-50"
                    disabled={operacaoBloqueada || draft.replace(/\D/g, "").length !== 8}
                    onClick={() => void onAlterarNcm(idx, draft)}
                  >
                    {editando ? "Aplicando…" : "Aplicar NCM"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
