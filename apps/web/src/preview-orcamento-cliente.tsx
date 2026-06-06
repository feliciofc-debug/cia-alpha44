import { brl, fmtNcm, usdKg } from "./lib/format.ts";
import { fobKgItem } from "./lib/fob-kg.ts";
import type { Cotacao, Item } from "./lib/types.ts";
import type { ResumoFinanceiro } from "./lib/financeiro.ts";

function fmtDataCurta() {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function PreviewOrcamentoCliente({
  cotacao,
  itens,
  financeiro,
  onBaixarPdf,
  pdfBaixando,
}: {
  cotacao: Cotacao;
  itens: Item[];
  financeiro: ResumoFinanceiro | null;
  onBaixarPdf?: () => void;
  pdfBaixando?: boolean;
}) {
  const empresa = cotacao.empresaTrade?.trim() || "CIA / Alpha 44";
  const fobTotalUS = itens.reduce((s, it) => s + (it.fobTotalUS > 0 ? it.fobTotalUS : 0), 0);
  const pesoTotalKg = itens.reduce((s, it) => s + (it.pesoLiqKg > 0 ? it.pesoLiqKg : 0), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white text-slate-900 shadow-xl">
      <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">Orçamento de importação</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">{empresa}</h3>
            <p className="mt-2 text-sm text-slate-600">
              Cliente: <span className="font-medium text-slate-900">{cotacao.cliente || "—"}</span>
            </p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p>Data: {fmtDataCurta()}</p>
            <p>Destino: {cotacao.destino}</p>
            <p>Incoterm: {cotacao.incoterm}</p>
            <p>Câmbio ref.: R$ {cotacao.cambio.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        <p className="text-sm font-semibold text-slate-800">Itens cotados</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Descrição</th>
                <th className="px-2 py-2">NCM</th>
                <th className="px-2 py-2 text-right">Qtd</th>
                <th className="px-2 py-2 text-right">Peso (kg)</th>
                <th className="px-2 py-2 text-right">FOB US$/kg</th>
                <th className="px-2 py-2 text-right">FOB US$</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, i) => {
                const fobKg = fobKgItem(it);
                return (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                    <td className="max-w-xs px-2 py-2">
                      <p className="font-medium text-slate-900">{it.descPt || it.descOriginal}</p>
                      {it.descDuimp && <p className="mt-0.5 text-[10px] text-slate-500">{it.descDuimp.slice(0, 100)}</p>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-700">{fmtNcm(it.ncm || "00000000")}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-slate-700">
                      {it.qtd != null ? it.qtd.toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-slate-700">
                      {it.pesoLiqKg > 0 ? it.pesoLiqKg.toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium text-slate-800">
                      {fobKg.principal != null ? usdKg(fobKg.principal) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-slate-700">
                      {it.fobTotalUS > 0 ? `US$ ${it.fobTotalUS.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-300 text-xs font-medium text-slate-700">
              <tr>
                <td colSpan={4} className="px-2 py-2 text-right">
                  Totais
                </td>
                <td className="px-2 py-2 text-right">{pesoTotalKg > 0 ? pesoTotalKg.toLocaleString("pt-BR") : "—"}</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2 text-right">US$ {fobTotalUS.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-6 rounded-lg border border-brand-200 bg-brand-50 px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="text-sm text-slate-600">
              <p>FOB total mercadorias: US$ {fobTotalUS.toFixed(2)}</p>
              <p className="mt-1">Câmbio de referência: R$ {cotacao.cambio.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</p>
              <p className="mt-1 text-xs text-slate-500">
                Inclui nacionalização, impostos, despesas locais e entrega até {cotacao.destino}.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">Investimento total estimado</p>
              <p className="mt-1 text-2xl font-bold text-brand-900">
                {financeiro ? brl(financeiro.totalOrcamentoBRL) : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">Condições gerais</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Valores em Reais (BRL), sujeitos a variação cambial até fechamento.</li>
            <li>Validade desta proposta: 15 dias corridos.</li>
            <li>Impostos e taxas conforme legislação vigente na data do desembarque.</li>
            <li>Carga ainda não inspecionada — sujeita a conferência aduaneira.</li>
          </ul>
        </div>
      </div>

      {onBaixarPdf && (
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-right">
          <button type="button" className="btn-primary text-sm" disabled={pdfBaixando} onClick={onBaixarPdf}>
            {pdfBaixando ? "Gerando PDF…" : "Baixar PDF deste orçamento"}
          </button>
        </div>
      )}

      <p className="border-t border-slate-100 px-6 py-2 text-center text-[10px] text-slate-400">
        Pré-visualização — o documento final pode variar após salvar.
      </p>
    </div>
  );
}
