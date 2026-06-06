import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api.ts";
import { brl } from "./lib/format.ts";
import type { RelatorioFaturamento } from "./lib/types.ts";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function RelatorioFaturamentoPainel() {
  const agora = new Date();
  const [tipo, setTipo] = useState<"mensal" | "anual">("mensal");
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [rel, setRel] = useState<RelatorioFaturamento | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [pdfBaixando, setPdfBaixando] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const anos = Array.from({ length: 5 }, (_, i) => agora.getFullYear() - i);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const r = await api.relatorioFaturamento(ano, tipo === "mensal" ? mes : undefined);
      setRel(r);
    } catch (e) {
      setRel(null);
      setErro(e instanceof Error ? e.message : "Falha ao carregar relatório.");
    } finally {
      setLoading(false);
    }
  }, [ano, mes, tipo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function imprimir() {
    window.print();
  }

  async function baixarPdf() {
    setPdfBaixando(true);
    setErro("");
    try {
      await api.baixarRelatorioFaturamentoPdf(ano, tipo === "mensal" ? mes : undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar PDF.");
    } finally {
      setPdfBaixando(false);
    }
  }

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #relatorio-faturamento-print, #relatorio-faturamento-print * { visibility: visible; }
          #relatorio-faturamento-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 24px;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Relatório de faturamento</h3>
          <p className="text-xs text-slate-500">Mensal para arquivo · Anual para o contador</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg border border-white/10 p-0.5">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs ${tipo === "mensal" ? "bg-white/10 text-white" : "text-slate-400"}`}
              onClick={() => setTipo("mensal")}
            >
              Mensal
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-xs ${tipo === "anual" ? "bg-white/10 text-white" : "text-slate-400"}`}
              onClick={() => setTipo("anual")}
            >
              Anual
            </button>
          </div>
          {tipo === "mensal" && (
            <select
              className="input w-auto py-1.5 text-xs"
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
            >
              {MESES.map((nome, i) => (
                <option key={nome} value={i + 1}>
                  {nome}
                </option>
              ))}
            </select>
          )}
          <select className="input w-auto py-1.5 text-xs" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {anos.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => void carregar()} disabled={loading}>
            Atualizar
          </button>
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={imprimir} disabled={!rel}>
            Imprimir
          </button>
          <button type="button" className="btn-primary py-1.5 text-xs" onClick={() => void baixarPdf()} disabled={!rel || pdfBaixando}>
            {pdfBaixando ? "Gerando…" : "Salvar PDF"}
          </button>
        </div>
      </div>

      {erro && <p className="no-print text-sm text-red-400">{erro}</p>}
      {loading && <p className="no-print text-sm text-slate-400">Carregando relatório…</p>}

      {rel && (
        <div
          id="relatorio-faturamento-print"
          ref={printRef}
          className="overflow-hidden rounded-xl border border-white/10 bg-white text-slate-900 shadow-xl"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
              {rel.tipo === "mensal" ? "Relatório mensal de faturamento" : "Relatório anual de faturamento"}
            </p>
            <h3 className="mt-1 text-xl font-bold">{rel.empresa}</h3>
            <p className="mt-2 text-sm text-slate-600">
              Período: <span className="font-medium text-slate-900">{rel.periodoLabel}</span>
              <span className="mx-2">·</span>
              Gerado em {fmtData(rel.geradoEm)}
            </p>
          </div>

          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[10px] uppercase text-slate-500">Processos</p>
              <p className="text-lg font-bold">{rel.totais.processos}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[10px] uppercase text-slate-500">Volume orçado</p>
              <p className="text-lg font-bold">{brl(rel.totais.volumeBRL)}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[10px] uppercase text-emerald-700">Receita trade</p>
              <p className="text-lg font-bold text-emerald-900">{brl(rel.totais.lucroTradeBRL)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[10px] uppercase text-slate-500">Lucro líquido trade</p>
              <p className="text-lg font-bold">{brl(rel.totais.lucroLiquidoBRL)}</p>
            </div>
          </div>

          {rel.tipo === "anual" && (
            <div className="px-6 pb-5">
              <p className="text-sm font-semibold text-slate-800">Faturamento mês a mês — exercício {rel.ano}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="border-b border-slate-300 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Mês</th>
                      <th className="px-2 py-2 text-right">Processos</th>
                      <th className="px-2 py-2 text-right">Volume orçado</th>
                      <th className="px-2 py-2 text-right">Receita trade</th>
                      <th className="px-2 py-2 text-right">Lucro líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rel.meses.map((m) => (
                      <tr key={m.mes} className={`border-b border-slate-100 ${m.processos === 0 ? "text-slate-400" : ""}`}>
                        <td className="px-2 py-2 font-medium">{MESES[m.mesNum - 1]}</td>
                        <td className="px-2 py-2 text-right">{m.processos}</td>
                        <td className="px-2 py-2 text-right">{brl(m.volumeBRL)}</td>
                        <td className="px-2 py-2 text-right">{brl(m.lucroTradeBRL)}</td>
                        <td className="px-2 py-2 text-right">{brl(m.lucroLiquidoBRL)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-400 font-bold">
                    <tr>
                      <td className="px-2 py-2">TOTAL {rel.ano}</td>
                      <td className="px-2 py-2 text-right">{rel.totais.processos}</td>
                      <td className="px-2 py-2 text-right">{brl(rel.totais.volumeBRL)}</td>
                      <td className="px-2 py-2 text-right">{brl(rel.totais.lucroTradeBRL)}</td>
                      <td className="px-2 py-2 text-right">{brl(rel.totais.lucroLiquidoBRL)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {rel.processos.length > 0 && (
            <div className="border-t border-slate-200 px-6 py-5">
              <p className="text-sm font-semibold text-slate-800">
                {rel.tipo === "mensal" ? "Processos do mês" : "Detalhamento de processos"}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Data</th>
                      <th className="px-2 py-2">Cliente</th>
                      <th className="px-2 py-2">Destino</th>
                      <th className="px-2 py-2 text-right">Orçamento</th>
                      <th className="px-2 py-2 text-right">Receita trade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rel.processos.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="whitespace-nowrap px-2 py-2">{fmtData(p.criadoEm)}</td>
                        <td className="px-2 py-2">{p.cliente}</td>
                        <td className="px-2 py-2">{p.destino}</td>
                        <td className="px-2 py-2 text-right">{brl(p.totalBRL)}</td>
                        <td className="px-2 py-2 text-right text-emerald-800">{brl(p.lucroTradeBRL)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {rel.processos.length === 0 && (
            <p className="px-6 pb-6 text-sm text-slate-500">Nenhum processo registrado neste período.</p>
          )}

          <p className="border-t border-slate-100 px-6 py-3 text-center text-[10px] text-slate-400">
            CIA / Alpha 44 · Relatório para controle interno e envio ao contador · Ticket médio{" "}
            {brl(rel.totais.ticketMedioBRL)}
          </p>
        </div>
      )}
    </div>
  );
}
