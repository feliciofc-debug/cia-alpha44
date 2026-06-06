import { brl, pct } from "./lib/format.ts";
import type { ClienteResumo } from "./lib/types.ts";

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function ClientesView({
  clientes,
  loading,
  busca,
  onAbrirCliente,
  onAbrirCotacao,
}: {
  clientes: ClienteResumo[];
  loading: boolean;
  busca: string;
  onAbrirCliente: (nome: string) => void;
  onAbrirCotacao: (id: string) => void;
}) {
  if (loading) {
    return <p className="p-12 text-center text-slate-400">Carregando clientes…</p>;
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-bold text-white">Clientes</h2>
        <p className="text-sm text-slate-400">
          {clientes.length} cliente(s)
          {busca.trim() ? ` · filtro “${busca.trim()}”` : ""}
        </p>
      </div>

      {clientes.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          Nenhum cliente encontrado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800/80 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Processos</th>
                <th className="px-4 py-3">Volume</th>
                <th className="px-4 py-3">Lucro trade</th>
                <th className="px-4 py-3">Markup médio</th>
                <th className="px-4 py-3">Destinos</th>
                <th className="px-4 py-3">Última</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.cliente} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-white">{c.cliente}</td>
                  <td className="px-4 py-3 text-slate-300">{c.processos}</td>
                  <td className="px-4 py-3 text-slate-300">{brl(c.volumeBRL)}</td>
                  <td className="px-4 py-3 text-emerald-300">{brl(c.lucroTradeBRL)}</td>
                  <td className="px-4 py-3 text-slate-400">{pct(c.markupMedioPct)}</td>
                  <td className="px-4 py-3 text-slate-500">{c.destinos.join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtData(c.ultimaCotacaoEm)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button type="button" className="btn-ghost py-1 text-xs" onClick={() => onAbrirCliente(c.cliente)}>
                      Filtrar
                    </button>
                    <button
                      type="button"
                      className="btn-ghost ml-1 py-1 text-xs"
                      onClick={() => onAbrirCotacao(c.ultimaCotacaoId)}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
