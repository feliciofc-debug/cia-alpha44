import { useCallback, useEffect, useState } from "react";
import { api, type BenchmarkPlanilhaStatus } from "./lib/api.ts";

export function BenchmarkReferenciaView() {
  const [status, setStatus] = useState<BenchmarkPlanilhaStatus | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setStatus(await api.benchmarkPlanilhaStatus());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar status.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function enviar(file: File) {
    setErro("");
    setSucesso("");
    setEnviando(true);
    try {
      const r = await api.uploadBenchmarkPlanilha(file);
      setSucesso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setEnviando(false);
    }
  }

  function fmtData(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Planilha FOB/kg — referência mensal</h2>
        <p className="mt-2 text-sm text-slate-400">
          Anexe a planilha que vocês recebem todo mês (ex.: IMPORTAÇÕES DA CHINA / Comex Plus). Os valores
          passam a valer como <strong className="text-slate-300">Histórico próprio</strong> e têm prioridade
          sobre o ComexStat nas cotações.
        </p>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white">Status atual</h3>
        {carregando ? (
          <p className="mt-3 text-sm text-slate-500">Carregando…</p>
        ) : status ? (
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Referência carregada</dt>
              <dd className={status.carregado ? "text-emerald-300" : "text-amber-300"}>
                {status.carregado ? "Sim" : "Nenhuma — faça o primeiro upload"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">NCMs na base</dt>
              <dd className="text-white">{status.total.toLocaleString("pt-BR")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Último arquivo</dt>
              <dd className="truncate text-slate-300">{status.arquivo ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Atualizado em</dt>
              <dd className="text-slate-300">{fmtData(status.atualizadoEm)}</dd>
            </div>
            {status.contexto && (
              <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
                {status.contexto}
              </div>
            )}
          </dl>
        ) : null}
      </div>

      <div
        className={`card p-8 text-center transition-colors ${
          dragOver ? "border-brand-500/50 bg-brand-500/5" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void enviar(file);
        }}
      >
        <p className="text-3xl">📊</p>
        <p className="mt-3 font-medium text-white">Arraste a planilha nova ou selecione o arquivo</p>
        <p className="mt-1 text-xs text-slate-500">.xlsx · .csv — colunas NCM + FOB/kg (US$/kg)</p>
        <label className={`btn-primary mt-6 inline-flex cursor-pointer ${enviando ? "pointer-events-none opacity-60" : ""}`}>
          {enviando ? "Importando…" : "Selecionar planilha"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            disabled={enviando}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void enviar(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {sucesso && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {sucesso}
        </p>
      )}
      {erro && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{erro}</p>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-slate-500">
        <p className="font-medium text-slate-400">Ordem de prioridade do FOB/kg na cotação</p>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>FOB da planilha do fornecedor (embarque)</li>
          <li>FOB/kg de NCM próximo na mesma carga</li>
          <li>Esta planilha mensal de referência (Histórico próprio)</li>
          <li>ComexStat MDIC (benchmark / canal de risco)</li>
        </ol>
      </div>
    </div>
  );
}
