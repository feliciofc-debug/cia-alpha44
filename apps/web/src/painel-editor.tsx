import { icmsSaidaParaDestino, UFS_BRASIL, UF_NOMES, type UfBrasil } from "./lib/icms-uf.ts";
import type { EditorDraft } from "./lib/editor-cotacao.ts";
import { pct } from "./lib/format.ts";

const BENEFICIOS: { id: EditorDraft["benefFiscal"]; label: string }[] = [
  { id: "ALAGOAS", label: "Alagoas — ICMS 4% quando destino = AL" },
  { id: "NENHUM", label: "Sem benefício fiscal" },
];

export function PainelEditorCotacao({
  draft,
  onChange,
  onAplicar,
  aplicando,
  modo,
}: {
  draft: EditorDraft;
  onChange: (d: EditorDraft) => void;
  onAplicar: () => void;
  aplicando?: boolean;
  modo: "analise" | "salva";
}) {
  const ufOpts = (UFS_BRASIL as readonly UfBrasil[]).map((sigla) => (
    <option key={sigla} value={sigla}>
      {sigla} — {UF_NOMES[sigla]}
    </option>
  ));

  const icmsEfetivo = draft.icmsManual
    ? draft.paramsAvancados.icmsSaida
    : icmsSaidaParaDestino(draft.destino, draft.benefFiscal);

  function patch(p: Partial<EditorDraft>) {
    const next = { ...draft, ...p };
    if (!next.icmsManual && (p.destino != null || p.benefFiscal != null)) {
      next.paramsAvancados = {
        ...next.paramsAvancados,
        icmsSaida: icmsSaidaParaDestino(next.destino, next.benefFiscal),
      };
    }
    onChange(next);
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
        <div>
          <label className="label">ICMS saída efetivo</label>
          <p className="input flex items-center bg-ink-900/60 text-brand-200">{pct(icmsEfetivo)}</p>
        </div>
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

      <details className="rounded-lg border border-white/10 bg-ink-900/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">
          Despesas locais ({draft.despesas.length} itens)
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
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={draft.icmsManual}
                onChange={(e) => {
                  const icmsManual = e.target.checked;
                  patch({
                    icmsManual,
                    paramsAvancados: {
                      ...draft.paramsAvancados,
                      icmsSaida: icmsManual
                        ? draft.paramsAvancados.icmsSaida
                        : icmsSaidaParaDestino(draft.destino, draft.benefFiscal),
                    },
                  });
                }}
              />
              ICMS saída manual (override da tabela UF)
            </label>
            {draft.icmsManual && (
              <input
                type="number"
                min={0}
                max={1}
                step={0.001}
                className="input mt-2 py-1"
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
        </div>
        <p className="mt-2 text-xs text-slate-500">Defaults da planilha 66 — altere só se souber o regime do cliente.</p>
      </details>

      <button type="button" className="btn-primary w-full sm:w-auto" disabled={aplicando} onClick={onAplicar}>
        {aplicando ? "Recalculando…" : modo === "salva" ? "Salvar e recalcular" : "Aplicar e recalcular"}
      </button>
    </div>
  );
}
