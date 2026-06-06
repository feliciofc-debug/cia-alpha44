import { brl, pct } from "./lib/format.ts";
import type { DashboardKpis } from "./lib/types.ts";

const CANAL_LABEL: Record<string, string> = {
  VERDE_PROVAVEL: "Verde",
  AMARELO_TECNICO: "Amarelo",
  VERMELHO_TECNICO: "Vermelho",
  CINZA_VALORACAO: "Cinza",
  SEM_CANAL: "Sem canal",
};

function KpiCard({
  titulo,
  valor,
  sub,
  destaque,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  destaque?: "brand" | "emerald" | "amber";
}) {
  const ring =
    destaque === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : destaque === "amber"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-brand-500/30 bg-brand-500/5";

  return (
    <div className={`rounded-xl border p-4 ${ring}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-white">{valor}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function PainelKpisView({
  kpis,
  loading,
  onAbrir,
}: {
  kpis: DashboardKpis | null;
  loading: boolean;
  onAbrir: (id: string) => void;
}) {
  if (loading) {
    return <p className="p-12 text-center text-slate-400">Carregando painel…</p>;
  }
  if (!kpis) {
    return <p className="p-12 text-center text-slate-400">Painel indisponível — verifique a API.</p>;
  }

  const maxCanal = Math.max(1, ...Object.values(kpis.porCanal));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-bold text-white">Painel executivo</h2>
        <p className="text-sm text-slate-400">
          Resumo de {kpis.amostra} cotações recentes · {kpis.totalCotacoes} no total
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard titulo="Cotações hoje" valor={String(kpis.cotacoesHoje)} sub={`${kpis.cotacoesSemana} na semana`} />
        <KpiCard titulo="Este mês" valor={String(kpis.cotacoesMes)} sub={`${kpis.totalCotacoes} acumulado`} />
        <KpiCard
          titulo="Volume orçado"
          valor={brl(kpis.volumeOrcadoBRL)}
          sub={`Ticket médio ${brl(kpis.ticketMedioBRL)}`}
          destaque="brand"
        />
        <KpiCard
          titulo="Lucro trade (amostra)"
          valor={brl(kpis.lucroTradeTotalBRL)}
          sub={`Markup médio ${pct(kpis.markupMedioPct)}`}
          destaque="emerald"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-ink-900/40 p-4">
          <p className="text-sm font-semibold text-white">Canal predominante</p>
          <div className="mt-4 space-y-3">
            {Object.entries(kpis.porCanal).map(([canal, qtd]) => (
              <div key={canal}>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{CANAL_LABEL[canal] ?? canal}</span>
                  <span>{qtd}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${(qtd / maxCanal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-ink-900/40 p-4">
          <p className="text-sm font-semibold text-white">Top destinos (UF)</p>
          <div className="mt-4 space-y-2">
            {kpis.porDestino.length === 0 ? (
              <p className="text-xs text-slate-500">Sem dados ainda.</p>
            ) : (
              kpis.porDestino.map((d) => (
                <div key={d.uf} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-300">{d.uf}</span>
                  <span className="text-slate-500">
                    {d.qtd} proc. · {brl(d.volumeBRL)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <p className="border-b border-white/10 bg-ink-800/80 px-4 py-3 text-sm font-semibold text-white">
          Últimas cotações
        </p>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Destino</th>
              <th className="px-4 py-2">Orçamento</th>
              <th className="px-4 py-2">Markup</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {kpis.recentes.map((c) => (
              <tr key={c.id} className="border-t border-white/5 text-slate-300">
                <td className="px-4 py-2">{c.cliente}</td>
                <td className="px-4 py-2">{c.destino}</td>
                <td className="px-4 py-2">{c.totalBRL != null ? brl(c.totalBRL) : "—"}</td>
                <td className="px-4 py-2 text-emerald-400">{pct(c.markupPct)}</td>
                <td className="px-4 py-2 text-right">
                  <button type="button" className="btn-ghost py-1 text-xs" onClick={() => onAbrir(c.id)}>
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
