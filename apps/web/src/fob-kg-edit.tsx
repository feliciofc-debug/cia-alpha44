import { useEffect, useState } from "react";
import type { AvisoValoracao, Item } from "./lib/types.ts";
import { fobKgItem, fobKgReferencia, fobKgFonteLabel, fmtFobKgPlanilha, usdKg } from "./lib/fob-kg.ts";

export function AvisoValoracaoFob({ aviso }: { aviso: AvisoValoracao }) {
  return (
    <p className="mt-1 text-[10px] font-medium text-amber-400">
      Valor {aviso.percentualAbaixo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% abaixo do piso
      defensável ({usdKg(aviso.pisoDefensavel)}) — risco de valoração aduaneira
    </p>
  );
}

export function InputFobKgItem({
  item,
  ordem,
  disabled,
  avisoValoracao,
  onCommit,
  onLimpar,
}: {
  item: Item;
  ordem: number;
  disabled?: boolean;
  avisoValoracao?: AvisoValoracao | null;
  onCommit: (ordem: number, fobKgManual: number | null) => void | Promise<void>;
  onLimpar?: (ordem: number) => void | Promise<void>;
}) {
  const fob = fobKgItem(item);
  const sugestao = fobKgReferencia(item);
  const fonte = fobKgFonteLabel(item);
  const [local, setLocal] = useState(
    fob.manual != null
      ? String(fob.manual)
      : sugestao != null
        ? fmtFobKgPlanilha(sugestao)
        : "",
  );
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (editando) return;
    const v = fob.manual ?? sugestao;
    setLocal(v != null ? (fob.manual != null ? String(v) : fmtFobKgPlanilha(v)) : "");
  }, [fob.manual, sugestao, editando]);

  function parseValor(): number | null {
    const raw = local.trim().replace(",", ".");
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  return (
    <div className="min-w-[7rem]">
      <div className="flex flex-wrap items-center gap-1">
        <input
          type="number"
          min={0}
          step={0.0001}
          disabled={disabled}
          title="FOB/kg US$ — override manual prevalece sobre planilha e ComexStat"
          className={`w-[5.5rem] rounded border px-1 py-0.5 text-xs disabled:opacity-50 ${
            fob.manualAtivo
              ? "border-emerald-500/60 bg-emerald-950/40 font-medium text-emerald-200"
              : "border-white/15 bg-ink-900/80 text-white"
          }`}
          value={local}
          onFocus={() => setEditando(true)}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            setEditando(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setEditando(false);
              void onCommit(ordem, parseValor());
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {fob.manualAtivo && onLimpar && (
          <button
            type="button"
            className="text-[10px] text-slate-400 underline hover:text-slate-200 disabled:opacity-50"
            disabled={disabled}
            title="Limpar override — volta planilha/calibragem"
            onClick={() => void onLimpar(ordem)}
          >
            limpar
          </button>
        )}
        <button
          type="button"
          className="rounded bg-brand-600/80 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          disabled={disabled}
          title="Gravar FOB/kg manual"
          onClick={() => {
            setEditando(false);
            void onCommit(ordem, parseValor());
          }}
        >
          Salvar
        </button>
      </div>
      {fob.manualAtivo && fob.referencia != null && (
        <span className="mt-0.5 block text-[10px] text-slate-500">ref. {usdKg(fob.referencia)}</span>
      )}
      {!fob.manualAtivo && fonte && (
        <span className="mt-0.5 block max-w-[12rem] truncate text-[10px] text-emerald-400/90" title={fonte}>
          {fonte}
        </span>
      )}
      {avisoValoracao && <AvisoValoracaoFob aviso={avisoValoracao} />}
    </div>
  );
}

export function InputCustoUnitarioVeiculo({
  item,
  ordem,
  disabled,
  onCommit,
}: {
  item: Item;
  ordem: number;
  disabled?: boolean;
  onCommit: (ordem: number, custoUnitarioUS: number) => void | Promise<void>;
}) {
  const valorAtual = item.fobUnitarioUS != null && item.fobUnitarioUS > 0 ? item.fobUnitarioUS : null;
  const [local, setLocal] = useState(valorAtual != null ? String(valorAtual) : "");
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroLocal, setErroLocal] = useState("");
  const [sucessoLocal, setSucessoLocal] = useState("");

  useEffect(() => {
    if (editando) return;
    setLocal(valorAtual != null ? String(valorAtual) : "");
  }, [valorAtual, editando]);

  function fmtCusto(v: number | null): string {
    if (v == null) return "Custo unitário não informado";
    return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function parseValor(): number | null {
    const raw = local.trim().replace(",", ".");
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function cancelar() {
    setLocal(valorAtual != null ? String(valorAtual) : "");
    setErroLocal("");
    setEditando(false);
  }

  async function salvar() {
    const v = parseValor();
    if (v == null) {
      setErroLocal("Informe um custo unitário maior que zero.");
      setSucessoLocal("");
      return;
    }
    setSalvando(true);
    setErroLocal("");
    setSucessoLocal("");
    try {
      await onCommit(ordem, v);
      setSucessoLocal(`Custo salvo: ${fmtCusto(v)}.`);
      setEditando(false);
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : "Falha ao salvar custo unitário.");
    } finally {
      setSalvando(false);
    }
  }

  const ocupado = disabled || salvando;

  if (!editando) {
    return (
      <div className="min-w-[7rem]">
        <span className="block text-[10px] font-semibold text-amber-300">
          {fmtCusto(valorAtual)} — custo unitário (veículo)
        </span>
        <button
          type="button"
          className="mt-1 rounded border border-amber-400/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 hover:border-amber-300 hover:text-amber-100 disabled:opacity-50"
          disabled={ocupado}
          title="Editar custo unitário do veículo"
          onClick={() => {
            setLocal(valorAtual != null ? String(valorAtual) : "");
            setErroLocal("");
            setSucessoLocal("");
            setEditando(true);
          }}
        >
          Editar custo
        </button>
        <span className="mt-0.5 block text-[10px] text-amber-200/80">
          Base FOB = valor de custo (veículo)
        </span>
        {sucessoLocal && <span className="mt-0.5 block text-[10px] text-emerald-300">{sucessoLocal}</span>}
        {item.fobKgAvisos?.slice(0, 1).map((aviso, i) => (
          <span key={i} className="mt-0.5 block max-w-[12rem] truncate text-[10px] text-slate-500" title={aviso}>
            {aviso}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-[7rem] rounded border border-amber-400/30 bg-amber-950/10 p-1">
      <span className="block text-[10px] font-semibold text-amber-300">Custo unit. (US$)</span>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <input
          type="number"
          min={0}
          step={0.01}
          autoFocus
          disabled={ocupado}
          title="Custo unitário do veículo — FOB = custo × quantidade"
          className="w-[5.5rem] rounded border border-amber-500/50 bg-ink-900/80 px-1 py-0.5 text-xs font-medium text-amber-100 disabled:opacity-50"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void salvar();
            if (e.key === "Escape") cancelar();
          }}
        />
        <button
          type="button"
          className="rounded bg-brand-600/80 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          disabled={ocupado || parseValor() == null}
          title="Gravar custo unitário do veículo"
          onClick={() => void salvar()}
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
          disabled={ocupado}
          onClick={cancelar}
        >
          Cancelar
        </button>
      </div>
      <span className="mt-0.5 block text-[10px] text-amber-200/80">
        Base FOB = valor de custo (veículo) — confirme o custo unitário
      </span>
      {erroLocal && <span className="mt-0.5 block text-[10px] text-red-300">{erroLocal}</span>}
      {item.fobKgAvisos?.slice(0, 1).map((aviso, i) => (
        <span key={i} className="mt-0.5 block max-w-[12rem] truncate text-[10px] text-slate-500" title={aviso}>
          {aviso}
        </span>
      ))}
    </div>
  );
}
