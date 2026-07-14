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
  const fonte = fob.manualAtivo ? "manual do operador" : fobKgFonteLabel(item);
  const fonteReferencia = fobKgFonteLabel({ ...item, fobKgManual: null });
  const [local, setLocal] = useState(
    fob.manual != null
      ? String(fob.manual)
      : sugestao != null
        ? fmtFobKgPlanilha(sugestao)
        : "",
  );
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroLocal, setErroLocal] = useState("");

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

  function valorAtualInput(): string {
    const v = fob.manual ?? sugestao;
    return v != null ? (fob.manual != null ? String(v) : fmtFobKgPlanilha(v)) : "";
  }

  function iniciarEdicao() {
    setLocal(valorAtualInput());
    setErroLocal("");
    setEditando(true);
  }

  function cancelarEdicao() {
    setLocal(valorAtualInput());
    setErroLocal("");
    setEditando(false);
  }

  async function salvar() {
    const valor = parseValor();
    if (valor == null) {
      setErroLocal("Informe um FOB/kg válido.");
      return;
    }
    setSalvando(true);
    setErroLocal("");
    try {
      await onCommit(ordem, valor);
      setEditando(false);
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : "Falha ao salvar FOB/kg.");
    } finally {
      setSalvando(false);
    }
  }

  async function limparManual() {
    const limpar = onLimpar ?? ((o: number) => onCommit(o, null));
    setSalvando(true);
    setErroLocal("");
    try {
      await limpar(ordem);
      setEditando(false);
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : "Falha ao limpar FOB/kg manual.");
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <div className="min-w-[7rem]">
        <span className="block text-[10px] font-semibold text-slate-300">FOB/kg US$</span>
        <div
          className={`mt-0.5 rounded border px-2 py-1 text-xs ${
            fob.manualAtivo
              ? "border-emerald-500/40 bg-emerald-950/30 font-medium text-emerald-100"
              : "border-white/10 bg-ink-900/60 text-slate-100"
          }`}
        >
          {fob.principal != null
            ? `${usdKg(fob.principal)} — ${fonte ?? "fonte não informada"}`
            : "FOB/kg pendente — informe manualmente"}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-50"
            disabled={disabled}
            onClick={iniciarEdicao}
          >
            Editar
          </button>
          {fob.manualAtivo && (
            <button
              type="button"
              className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:border-slate-400/50 hover:text-slate-200 disabled:opacity-50"
              disabled={disabled || salvando}
              title="Limpar override — volta planilha/calibragem"
              onClick={() => void limparManual()}
            >
              Limpar manual
            </button>
          )}
        </div>
        {fob.manualAtivo && fob.referencia != null && (
          <span className="mt-0.5 block max-w-[12rem] truncate text-[10px] text-slate-500" title={fonteReferencia ?? "referência anterior"}>
            referência anterior: {fonteReferencia ?? "fonte anterior"} · {usdKg(fob.referencia)}
          </span>
        )}
        {!fob.manualAtivo && fonte && (
          <span className="mt-0.5 block max-w-[12rem] truncate text-[10px] text-slate-500" title={fonte}>
            fonte: {fonte}
          </span>
        )}
        {erroLocal && <span className="block text-[10px] text-red-300">{erroLocal}</span>}
        {avisoValoracao && <AvisoValoracaoFob aviso={avisoValoracao} />}
      </div>
    );
  }

  return (
    <div className="min-w-[7rem]">
      <span className="block text-[10px] font-semibold text-slate-300">FOB/kg US$</span>
      <div className="mt-0.5 space-y-1 rounded border border-sky-400/30 bg-sky-950/20 p-1">
        <input
          type="number"
          min={0}
          step={0.0001}
          disabled={disabled || salvando}
          title="FOB/kg US$ — override manual prevalece sobre planilha e ComexStat"
          className="w-full rounded border border-white/15 bg-ink-900 px-1.5 py-1 text-xs text-white disabled:opacity-50"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            setErroLocal("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void salvar();
            }
            if (e.key === "Escape") {
              cancelarEdicao();
            }
          }}
        />
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded bg-brand-600/80 px-2 py-1 text-[10px] font-bold text-white hover:bg-brand-500 disabled:opacity-50"
            disabled={disabled || salvando}
            title="Gravar FOB/kg manual"
            onClick={() => void salvar()}
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            className="rounded bg-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
            disabled={disabled || salvando}
            onClick={cancelarEdicao}
          >
            Cancelar
          </button>
        </div>
        {erroLocal && <span className="block text-[10px] text-red-300">{erroLocal}</span>}
      </div>
      {sugestao != null && (
        <span className="mt-0.5 block max-w-[12rem] truncate text-[10px] text-slate-500" title={fonteReferencia ?? "referência anterior"}>
          referência: {fonteReferencia ?? "fonte anterior"} · {usdKg(sugestao)}
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

  useEffect(() => {
    if (editando) return;
    setLocal(valorAtual != null ? String(valorAtual) : "");
  }, [valorAtual, editando]);

  function parseValor(): number | null {
    const raw = local.trim().replace(",", ".");
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function iniciarEdicao() {
    setLocal(valorAtual != null ? String(valorAtual) : "");
    setErroLocal("");
    setEditando(true);
  }

  function cancelarEdicao() {
    setLocal(valorAtual != null ? String(valorAtual) : "");
    setErroLocal("");
    setEditando(false);
  }

  async function salvar() {
    const valor = parseValor();
    if (valor == null) {
      setErroLocal("Informe um custo unitário válido.");
      return;
    }
    setSalvando(true);
    setErroLocal("");
    try {
      await onCommit(ordem, valor);
      setEditando(false);
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : "Falha ao salvar custo unitário.");
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <div className="min-w-[7rem]">
        <span className="block text-[10px] font-semibold text-amber-300">Custo unit. (US$)</span>
        <div className="mt-0.5 rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1 text-xs font-medium text-amber-100">
          {valorAtual != null
            ? `US$ ${valorAtual.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} — custo unitário (veículo)`
            : "Custo unitário pendente — veículo"}
        </div>
        <button
          type="button"
          className="mt-1 rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:border-amber-400/50 hover:text-amber-100 disabled:opacity-50"
          disabled={disabled}
          onClick={iniciarEdicao}
        >
          Editar custo
        </button>
        <span className="mt-0.5 block text-[10px] text-amber-200/80">
          Base FOB = valor de custo (veículo)
        </span>
        {item.fobKgAvisos?.slice(0, 1).map((aviso, i) => (
          <span key={i} className="mt-0.5 block max-w-[12rem] truncate text-[10px] text-slate-500" title={aviso}>
            {aviso}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-[7rem]">
      <span className="block text-[10px] font-semibold text-amber-300">Custo unit. (US$)</span>
      <div className="mt-0.5 space-y-1 rounded border border-amber-400/30 bg-amber-950/20 p-1">
        <input
          type="number"
          min={0}
          step={0.01}
          disabled={disabled || salvando}
          title="Custo unitário do veículo — FOB = custo × quantidade"
          className="w-full rounded border border-amber-500/50 bg-ink-900/80 px-1.5 py-1 text-xs font-medium text-amber-100 disabled:opacity-50"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            setErroLocal("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void salvar();
            }
            if (e.key === "Escape") {
              cancelarEdicao();
            }
          }}
        />
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded bg-brand-600/80 px-2 py-1 text-[10px] font-bold text-white hover:bg-brand-500 disabled:opacity-50"
            disabled={disabled || salvando}
            title="Gravar custo unitário do veículo"
            onClick={() => void salvar()}
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            className="rounded bg-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50"
            disabled={disabled || salvando}
            onClick={cancelarEdicao}
          >
            Cancelar
          </button>
        </div>
        {erroLocal && <span className="block text-[10px] text-red-300">{erroLocal}</span>}
      </div>
      <span className="mt-0.5 block text-[10px] text-amber-200/80">
        Base FOB = valor de custo (veículo) — confirme o custo unitário
      </span>
      {item.fobKgAvisos?.slice(0, 1).map((aviso, i) => (
        <span key={i} className="mt-0.5 block max-w-[12rem] truncate text-[10px] text-slate-500" title={aviso}>
          {aviso}
        </span>
      ))}
    </div>
  );
}
