import { aplicarIcmsCotacao } from "@cia/shared";
import { UFS_BRASIL, UF_NOMES, type UfBrasil } from "./lib/icms-uf.ts";
import { despesasParaContainers, totalDespesas } from "./lib/despesas.ts";
import type { EditorDraft } from "./lib/editor-cotacao.ts";
import { pct } from "./lib/format.ts";
import type { IcmsCotacaoMeta } from "./lib/types.ts";

const BENEFICIOS: { id: EditorDraft["benefFiscal"]; label: string }[] = [
  { id: "ALAGOAS", label: "Alagoas — ICMS 4% quando destino = AL" },
  { id: "NENHUM", label: "Sem benefício fiscal" },
];

const REGIMES: { id: EditorDraft["regimeIcms"]; label: string }[] = [
  { id: "AL_DIFERIDO", label: "AL diferido — ICMS entrada 0% (padrão)" },
  { id: "NORMAL", label: "Normal — aviso obrigatório v1" },
];

function previewIcmsMeta(draft: EditorDraft, avisosFiscais: string[] = []): IcmsCotacaoMeta {
  const { meta } = aplicarIcmsCotacao({
    ufEmpresa: draft.ufEmpresa,
    destino: draft.destino,
    regimeIcms: draft.regimeIcms,
    icmsSaidaManualFlag: draft.icmsSaidaManualFlag,
    params: {
      markupPct: draft.markupPct,
      pisSaida: draft.paramsAvancados.pisSaida,
      cofinsSaida: draft.paramsAvancados.cofinsSaida,
      icmsSaida: draft.paramsAvancados.icmsSaida,
      csllSobreMarkup: draft.paramsAvancados.csllSobreMarkup,
      irrfAliq: draft.paramsAvancados.irrfAliq,
      irrfBaseNotaPct: draft.paramsAvancados.irrfBaseNotaPct,
      ipiTetoAliqMedia: 0.15,
      icmsEntrada: 0,
    },
    avisosFiscais,
  });
  return meta;
}

export function PainelEditorCotacao({
  draft,
  onChange,
  onAplicar,
  aplicando,
  modo,
  avisosFiscais = [],
  onConfirmarIcmsSaida,
  confirmandoIcms,
}: {
  draft: EditorDraft;
  onChange: (d: EditorDraft) => void;
  onAplicar: () => void;
  aplicando?: boolean;
  modo: "analise" | "salva";
  /** Avisos persistidos (backfill legado) — exibidos no bloco ICMS. */
  avisosFiscais?: string[];
  onConfirmarIcmsSaida?: () => void;
  confirmandoIcms?: boolean;
}) {
  const ufOpts = (UFS_BRASIL as readonly UfBrasil[]).map((sigla) => (
    <option key={sigla} value={sigla}>
      {sigla} — {UF_NOMES[sigla]}
    </option>
  ));

  const icmsMeta = previewIcmsMeta(draft, avisosFiscais);
  const icmsLegadoPendente = avisosFiscais.some(
    (a) => a.includes("legado") && a.includes("revisar e confirmar"),
  );

  function patch(p: Partial<EditorDraft>) {
    onChange({ ...draft, ...p });
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-brand-500/40 bg-brand-500/5 p-4">
      <div>
        <p className="text-sm font-bold text-white">Editor da cotação</p>
        <p className="mt-1 text-xs text-slate-400">
          Ajuste margem, despesas, UF e cabeçalho — depois clique em recalcular.
          {modo === "salva" ? " Alterações são salvas no mesmo processo." : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Empresa trade (importadora)</label>
          <input
            className="input"
            value={draft.empresaTrade}
            onChange={(e) => patch({ empresaTrade: e.target.value })}
            placeholder="Ex.: Alpha 44 Comércio Exterior"
          />
        </div>
        <div>
          <label className="label">Cliente final</label>
          <input
            className="input"
            value={draft.cliente}
            onChange={(e) => patch({ cliente: e.target.value })}
            placeholder="Ex.: Loja XYZ — Campinas"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Câmbio USD (PTAX venda)</label>
          <input
            type="number"
            min={0}
            step={0.0001}
            className="input"
            value={draft.cambio}
            onChange={(e) => patch({ cambio: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="label">Frete internacional (US$)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            className="input"
            value={draft.freteTotalUS}
            onChange={(e) => patch({ freteTotalUS: Number(e.target.value) || 0 })}
          />
          <p className="mt-1 text-xs text-slate-500">Planilha 66: US$ 3.500 / container</p>
        </div>
        <div>
          <label className="label">Taxa Siscomex (R$)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            className="input"
            value={draft.siscomex}
            onChange={(e) => patch({ siscomex: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="label">Adicionais VA (US$)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            className="input"
            value={draft.adicionaisVaUS}
            onChange={(e) => patch({ adicionaisVaUS: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Origem (UF)</label>
          <select className="input" value={draft.origem} onChange={(e) => patch({ origem: e.target.value })}>
            {ufOpts}
          </select>
        </div>
        <div>
          <label className="label">Destino (UF)</label>
          <select className="input" value={draft.destino} onChange={(e) => patch({ destino: e.target.value })}>
            {ufOpts}
          </select>
        </div>
        <div>
          <label className="label">Benefício fiscal</label>
          <select
            className="input"
            value={draft.benefFiscal}
            onChange={(e) => patch({ benefFiscal: e.target.value as EditorDraft["benefFiscal"] })}
          >
            {BENEFICIOS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-sm font-semibold text-amber-100">ICMS — empresa e regime (P2.3)</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">UF sede importadora</label>
            <select
              className="input"
              value={draft.ufEmpresa}
              onChange={(e) => patch({ ufEmpresa: e.target.value })}
            >
              {ufOpts}
            </select>
          </div>
          <div>
            <label className="label">Regime ICMS entrada</label>
            <select
              className="input"
              value={draft.regimeIcms}
              onChange={(e) => patch({ regimeIcms: e.target.value as EditorDraft["regimeIcms"] })}
            >
              {REGIMES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ICMS saída efetivo</label>
            <div className="input flex flex-wrap items-center gap-2 bg-ink-900/60 text-brand-200">
              <span className="font-semibold">{pct(icmsMeta.icmsSaidaEfetivo)}</span>
              {draft.icmsSaidaManualFlag && (
                <span className="rounded bg-amber-600/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                  Override manual em vigor
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500" title={icmsMeta.fundamentoSaida}>
              {icmsMeta.fundamentoSaida}
            </p>
            {draft.icmsSaidaManualFlag && (
              <p className="mt-1 text-[11px] text-amber-300/90">
                Alterar UF/regime não muda o % até desmarcar o override manual.
              </p>
            )}
          </div>
        </div>

        {icmsMeta.avisoRegimeIcms && (
          <div className="rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-100">
            {icmsMeta.avisoRegimeIcms}
          </div>
        )}

        {avisosFiscais.length > 0 && (
          <div className="space-y-2">
            {avisosFiscais.map((a) => (
              <div
                key={a}
                className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100"
              >
                {a}
              </div>
            ))}
            {icmsLegadoPendente && onConfirmarIcmsSaida && (
              <button
                type="button"
                className="btn-ghost text-xs text-emerald-300 hover:text-emerald-200"
                disabled={confirmandoIcms}
                onClick={onConfirmarIcmsSaida}
              >
                {confirmandoIcms ? "Confirmando…" : "Confirmar ICMS calculado (aceitar alíquota do resolver)"}
              </button>
            )}
          </div>
        )}

        <details className="rounded border border-white/10 bg-ink-900/40 px-2 py-1">
          <summary className="cursor-pointer text-xs text-slate-400">Override manual de ICMS saída</summary>
          <div className="mt-2 space-y-2 pb-2">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={draft.icmsSaidaManualFlag}
                onChange={(e) => patch({ icmsSaidaManualFlag: e.target.checked })}
              />
              Forçar ICMS saída manual (icmsSaidaManualFlag)
            </label>
            {draft.icmsSaidaManualFlag && (
              <input
                type="number"
                min={0}
                max={1}
                step={0.001}
                className="input py-1 text-sm"
                value={draft.paramsAvancados.icmsSaida}
                onChange={(e) =>
                  patch({
                    paramsAvancados: {
                      ...draft.paramsAvancados,
                      icmsSaida: Number(e.target.value) || 0,
                    },
                  })
                }
              />
            )}
          </div>
        </details>
      </div>

      <div>
        <label className="label">Markup (lucro da trade) — {pct(draft.markupPct)}</label>
        <input
          type="range"
          min={0}
          max={0.25}
          step={0.005}
          value={draft.markupPct}
          onChange={(e) => patch({ markupPct: Number(e.target.value) })}
          className="w-full accent-brand-500"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>0%</span>
          <span>25%</span>
        </div>
      </div>

      <div>
        <label className="label">Nº de containers — despesas locais × {draft.qtdContainers}</label>
        <input
          type="number"
          min={1}
          max={99}
          step={1}
          className="input max-w-[8rem]"
          value={draft.qtdContainers}
          onChange={(e) => {
            const qtd = Math.max(1, Math.round(Number(e.target.value) || 1));
            patch({
              qtdContainers: qtd,
              despesas: despesasParaContainers(qtd),
            });
          }}
        />
        <p className="mt-1 text-xs text-slate-500">
          Valores padrão da planilha 66 por container — editáveis abaixo.
        </p>
      </div>

      <details open className="rounded-lg border border-white/10 bg-ink-900/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">
          Despesas locais ({draft.despesas.length} itens) — total R${" "}
          {totalDespesas(draft.despesas).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </summary>
        <div className="mt-3 max-h-64 space-y-2 overflow-auto">
          {draft.despesas.map((d, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem] gap-2 text-xs">
              <span className="truncate self-center text-slate-400">{d.nome}</span>
              <input
                type="number"
                min={0}
                step={0.01}
                className="input py-1 text-right"
                value={d.valorBRL || ""}
                onChange={(e) => {
                  const despesas = [...draft.despesas];
                  despesas[i] = { ...d, valorBRL: Number(e.target.value) || 0 };
                  patch({ despesas });
                }}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Valores em R$ — entram no custo de nacionalização / base de saída.</p>
      </details>

      <details className="rounded-lg border border-white/10 bg-ink-900/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">Parâmetros fiscais avançados</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["pisSaida", "PIS saída", 0.0165],
              ["cofinsSaida", "COFINS saída", 0.076],
              ["csllSobreMarkup", "CSLL s/ markup", 0.09],
              ["irrfAliq", "IRRF", 0.25],
              ["irrfBaseNotaPct", "Base nota IRRF", 0.027],
            ] as const
          ).map(([key, label, def]) => (
            <div key={key}>
              <label className="label text-xs">{label}</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.001}
                className="input py-1"
                value={draft.paramsAvancados[key]}
                onChange={(e) =>
                  patch({
                    paramsAvancados: {
                      ...draft.paramsAvancados,
                      [key]: Number(e.target.value) || def,
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Defaults da planilha 66 — ICMS saída no bloco acima.</p>
      </details>

      <button type="button" className="btn-primary w-full sm:w-auto" disabled={aplicando} onClick={onAplicar}>
        {aplicando ? "Recalculando…" : modo === "salva" ? "Salvar e recalcular" : "Aplicar e recalcular"}
      </button>
    </div>
  );
}
