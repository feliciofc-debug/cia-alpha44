import { Fragment, useEffect, useMemo, useState } from "react";
import type { Item } from "./lib/types.ts";
import { fmtNcm } from "./lib/format.ts";
import {
  contagemEstadosNcm,
  itemPodeConfirmarNcmIndividual,
  itemPodeDesfazerNcm,
  itensPendentesConfirmacaoNcm,
  pendenciasCompatibilidadeOrdenadas,
  pendenciasNcmOrdenadas,
  type PendenciaNcmItem,
} from "./lib/ncm.ts";
import { LookupNcmInline } from "./ncm-conciliacao-ui.tsx";
import { InputFobKgItem } from "./fob-kg-edit.tsx";
import { FobKgLinhaNcm } from "./fob-kg-linha-ncm.tsx";
import type { AvisoValoracao } from "./lib/types.ts";

function estilosCard(severidade: "bloqueia" | "revisar", destacado: boolean): string {
  const base =
    severidade === "bloqueia"
      ? "border-red-500/70 bg-red-950/30"
      : "border-amber-500/60 bg-amber-500/10";
  const pulse = destacado ? " ring-2 ring-red-400 ring-offset-2 ring-offset-slate-900 animate-pulse" : "";
  return `rounded-lg border-2 p-3 ${base}${pulse}`;
}

function CardPendencia({
  pendencia,
  destacado,
  draft,
  onDraftChange,
  podeConfirmar,
  podeDesfazer,
  editando,
  confirmando,
  operacaoBloqueada,
  onConfirmarNcm,
  onDesfazerNcm,
  onAlterarNcm,
  onAlterarFobKg,
  alterandoFobKg,
  avisosValoracaoFob,
}: {
  pendencia: PendenciaNcmItem;
  destacado: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  podeConfirmar: boolean;
  podeDesfazer: boolean;
  editando: boolean;
  confirmando: boolean;
  operacaoBloqueada: boolean;
  onConfirmarNcm: (ordem: number) => void | Promise<void>;
  onDesfazerNcm?: (ordem: number) => void | Promise<void>;
  onAlterarNcm: (ordem: number, ncm: string) => void | Promise<void>;
  onAlterarFobKg?: (ordem: number, fobKgManual: number | null) => void | Promise<void>;
  alterandoFobKg?: number | null;
  avisosValoracaoFob?: Record<number, AvisoValoracao | null>;
}) {
  const { idx, ordem, item: it, nome, motivo, severidade } = pendencia;
  const badge =
    severidade === "bloqueia"
      ? "bg-red-600/80 text-red-50"
      : "bg-amber-500/80 text-amber-950";

  return (
    <li id={`resolucao-ncm-item-${idx}`} className={estilosCard(severidade, destacado)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-slate-400">Item #{idx + 1}</p>
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge}`}>
              {severidade === "bloqueia" ? "Bloqueia PDF" : "Revisar"}
            </span>
          </div>
          <p className="font-medium text-white">{nome}</p>
          <p className="mt-1 text-xs text-slate-200">{motivo}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            NCM atual: <span className="font-mono text-emerald-300">{fmtNcm(it.ncm || "00000000")}</span>
          </p>
          <div className="mt-1 text-xs">
            <FobKgLinhaNcm item={it} />
          </div>
          {podeDesfazer && (
            <p className="mt-1 text-xs font-medium text-emerald-400">
              Confirmado{it.ncmConfirmadoPor ? ` · ${it.ncmConfirmadoPor}` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end">
          {podeConfirmar && (
            <button
              type="button"
              className="min-w-[9rem] rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              disabled={operacaoBloqueada}
              onClick={() => void onConfirmarNcm(ordem)}
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
              onClick={() => void onDesfazerNcm(ordem)}
            >
              Desfazer
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-400">
          Editar NCM
          <input
            type="text"
            inputMode="numeric"
            maxLength={10}
            className="mt-1 block w-36 rounded border border-white/20 bg-ink-800 px-2 py-2 font-mono text-sm text-white"
            value={draft}
            disabled={operacaoBloqueada}
            onChange={(e) => onDraftChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
        </label>
        <button
          type="button"
          className="rounded-lg border border-brand-500/50 bg-brand-500/20 px-4 py-2 text-sm font-semibold text-brand-200 hover:bg-brand-500/30 disabled:opacity-50"
          disabled={operacaoBloqueada || draft.replace(/\D/g, "").length !== 8}
          onClick={() => void onAlterarNcm(ordem, draft)}
        >
          {editando ? "Aplicando…" : "Aplicar NCM"}
        </button>
        </div>
        <LookupNcmInline ncmDraft={draft} />
      </div>
      {onAlterarFobKg && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="mb-1 text-xs text-slate-400">FOB/kg US$ (override manual)</p>
          <InputFobKgItem
            item={it}
            ordem={ordem}
            disabled={operacaoBloqueada || alterandoFobKg === ordem}
            avisoValoracao={avisosValoracaoFob?.[ordem]}
            onCommit={onAlterarFobKg}
            onLimpar={(o) => void onAlterarFobKg(o, null)}
          />
        </div>
      )}
    </li>
  );
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
  onAlterarFobKg,
  alterandoFobKg,
  avisosValoracaoFob,
  confirmandoNcm,
  alterandoNcm,
  destaqueIdx,
}: {
  itens: Item[];
  aberta: boolean;
  onToggle: () => void;
  onConfirmarNcm: (ordem: number) => void | Promise<void>;
  onConfirmarTodosNcm?: () => void | Promise<void>;
  confirmandoTodosNcm?: boolean;
  resumoNcmLote?: { aprovados: number; pendentes: number } | null;
  onDesfazerNcm?: (ordem: number) => void | Promise<void>;
  onAlterarNcm: (ordem: number, ncm: string) => void | Promise<void>;
  onAlterarFobKg?: (ordem: number, fobKgManual: number | null) => void | Promise<void>;
  alterandoFobKg?: number | null;
  avisosValoracaoFob?: Record<number, AvisoValoracao | null>;
  confirmandoNcm?: number | null;
  alterandoNcm?: number | null;
  destaqueIdx?: number | null;
}) {
  const bloqueadores = useMemo(() => pendenciasNcmOrdenadas(itens), [itens]);
  const revisar = useMemo(() => pendenciasCompatibilidadeOrdenadas(itens), [itens]);
  const contagem = useMemo(() => contagemEstadosNcm(itens), [itens]);
  const elegiveis = useMemo(() => itensPendentesConfirmacaoNcm(itens).length, [itens]);
  const operacaoBloqueada = Boolean(
    confirmandoTodosNcm || confirmandoNcm != null || alterandoNcm != null || alterandoFobKg != null,
  );

  const [draftNcm, setDraftNcm] = useState<Record<number, string>>({});
  const [pulseIdx, setPulseIdx] = useState<number | null>(null);

  useEffect(() => {
    if (destaqueIdx == null) return;
    setPulseIdx(destaqueIdx);
    const scroll = () =>
      document.getElementById(`resolucao-ncm-item-${destaqueIdx}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    requestAnimationFrame(() => requestAnimationFrame(scroll));
    const t = window.setTimeout(() => setPulseIdx(null), 2000);
    return () => window.clearTimeout(t);
  }, [destaqueIdx]);

  const totalPendencias = bloqueadores.length + revisar.length;

  if (!totalPendencias && !resumoNcmLote) return null;

  function renderCard(p: PendenciaNcmItem) {
    const it = p.item;
    const draft = draftNcm[p.ordem] ?? (it.ncm || "").replace(/\D/g, "").slice(0, 8);
    return (
      <CardPendencia
        pendencia={p}
        destacado={pulseIdx === p.idx}
        draft={draft}
        onDraftChange={(v) => setDraftNcm((prev) => ({ ...prev, [p.ordem]: v }))}
        podeConfirmar={itemPodeConfirmarNcmIndividual(it)}
        podeDesfazer={itemPodeDesfazerNcm(it)}
        editando={alterandoNcm === p.ordem}
        confirmando={confirmandoNcm === p.ordem}
        operacaoBloqueada={operacaoBloqueada}
        onConfirmarNcm={onConfirmarNcm}
        onDesfazerNcm={onDesfazerNcm}
        onAlterarNcm={onAlterarNcm}
        onAlterarFobKg={onAlterarFobKg}
        alterandoFobKg={alterandoFobKg}
        avisosValoracaoFob={avisosValoracaoFob}
      />
    );
  }

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
          {aberta ? "▲ Ocultar resolução" : `▶ Resolver pendências (${totalPendencias})`}
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
      </div>

      <p className="mt-3 text-sm font-medium text-amber-50">
        <span className="text-red-300">● {contagem.bloqueando} bloqueando</span>
        <span className="mx-2 text-amber-200/60">·</span>
        <span className="text-amber-200">● {contagem.revisar} revisar</span>
        <span className="mx-2 text-amber-200/60">·</span>
        <span className="text-emerald-300">● {contagem.ok} OK</span>
      </p>

      {resumoNcmLote && (
        <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {resumoNcmLote.aprovados} aprovado{resumoNcmLote.aprovados === 1 ? "" : "s"} ·{" "}
          {resumoNcmLote.pendentes} pendente{resumoNcmLote.pendentes === 1 ? "" : "s"} (precisam de NCM/edição
          manual)
        </p>
      )}

      {aberta && (
        <div className="mt-4 max-h-[28rem] space-y-4 overflow-y-auto">
          {bloqueadores.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-red-300">
                Bloqueia o PDF ({bloqueadores.length})
              </h3>
              <ul className="space-y-3">
                {bloqueadores.map((p) => (
                  <Fragment key={p.ordem}>{renderCard(p)}</Fragment>
                ))}
              </ul>
            </section>
          )}

          {revisar.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-200">
                Revisar ({revisar.length})
              </h3>
              <ul className="space-y-3">
                {revisar.map((p) => (
                  <Fragment key={p.ordem}>{renderCard(p)}</Fragment>
                ))}
              </ul>
            </section>
          )}

          {contagem.ok > 0 && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
              {contagem.ok} item{contagem.ok === 1 ? "" : "s"} OK — NCM confirmado ou compatível (não listados
              aqui).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
