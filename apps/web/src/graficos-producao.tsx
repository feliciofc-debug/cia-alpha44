import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { brl } from "./lib/format.ts";
import type { DashboardSeries } from "./lib/types.ts";

function fmtTooltip(v: unknown) {
  return brl(typeof v === "number" ? v : Number(v) || 0);
}

export function GraficosProducao({ series }: { series: DashboardSeries | null }) {
  if (!series) return null;

  const data = series.serie.map((s) => ({
    name: s.label,
    volume: Math.round(s.volumeBRL),
    lucro: Math.round(s.lucroTradeBRL),
    processos: s.processos,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-ink-900/40 p-4">
        <p className="text-sm font-semibold text-white">Faturamento global (12 meses)</p>
        <p className="text-xs text-slate-500">Volume orçado por mês</p>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                formatter={(v) => [fmtTooltip(v), "Volume"]}
              />
              <Bar dataKey="volume" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-ink-900/40 p-4">
        <p className="text-sm font-semibold text-white">Lucro da trade (12 meses)</p>
        <p className="text-xs text-slate-500">Markup bruto acumulado por mês</p>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                formatter={(v) => [fmtTooltip(v), "Lucro trade"]}
              />
              <Legend />
              <Line type="monotone" dataKey="lucro" stroke="#34d399" strokeWidth={2} dot={{ fill: "#34d399" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 lg:col-span-2">
        <p className="text-sm font-semibold text-brand-200">Projeções</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Projeção mês (volume)</p>
            <p className="text-lg font-bold text-white">{brl(series.projecaoMensal.volumeBRL)}</p>
            <p className="text-xs text-slate-500">{series.projecaoMensal.processos} processos estimados</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Projeção mês (lucro trade)</p>
            <p className="text-lg font-bold text-emerald-300">{brl(series.projecaoMensal.lucroTradeBRL)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Projeção anual (volume)</p>
            <p className="text-lg font-bold text-white">{brl(series.projecaoAnual.volumeBRL)}</p>
            <p className="text-xs text-slate-500">média/mês {brl(series.projecaoAnual.baseMediaMensalVolume)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Projeção anual (lucro trade)</p>
            <p className="text-lg font-bold text-emerald-300">{brl(series.projecaoAnual.lucroTradeBRL)}</p>
            <p className="text-xs text-slate-500">média/mês {brl(series.projecaoAnual.baseMediaMensalLucro)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
