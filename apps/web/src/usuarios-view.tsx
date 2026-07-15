import type { UsuarioAdmin } from "./lib/api.ts";

function fmtData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<UsuarioAdmin["status"], string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  bloqueado: "Bloqueado",
};

const STATUS_STYLE: Record<UsuarioAdmin["status"], string> = {
  pendente: "bg-amber-500/20 text-amber-300",
  aprovado: "bg-emerald-500/20 text-emerald-300",
  bloqueado: "bg-red-500/20 text-red-300",
};

export function UsuariosView({
  usuarios,
  loading,
  acaoId,
  onAprovar,
  onBloquear,
}: {
  usuarios: UsuarioAdmin[];
  loading: boolean;
  acaoId: string | null;
  onAprovar: (id: string) => void | Promise<void>;
  onBloquear: (id: string) => void | Promise<void>;
}) {
  if (loading) {
    return <p className="p-12 text-center text-slate-400">Carregando usuários…</p>;
  }

  const pendentes = usuarios.filter((u) => u.status === "pendente").length;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-bold text-white">Usuários</h2>
        <p className="text-sm text-slate-400">
          {usuarios.length} conta(s)
          {pendentes > 0 ? ` · ${pendentes} aguardando aprovação` : ""}
        </p>
      </div>

      {usuarios.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          Nenhum usuário cadastrado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800/80 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-white">{u.nome}</td>
                  <td className="px-4 py-3 text-slate-300">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[u.status]}`}>
                      {STATUS_LABEL[u.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{u.role}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtData(u.criadoEm)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {u.status === "pendente" && (
                      <button
                        type="button"
                        className="btn-primary py-1 text-xs"
                        disabled={acaoId === u.id}
                        onClick={() => void onAprovar(u.id)}
                      >
                        {acaoId === u.id ? "…" : "Aprovar"}
                      </button>
                    )}
                    {u.status === "aprovado" && u.role !== "admin" && (
                      <button
                        type="button"
                        className="btn-ghost py-1 text-xs text-red-300"
                        disabled={acaoId === u.id}
                        onClick={() => void onBloquear(u.id)}
                      >
                        {acaoId === u.id ? "…" : "Bloquear"}
                      </button>
                    )}
                    {u.status === "bloqueado" && (
                      <button
                        type="button"
                        className="btn-ghost py-1 text-xs"
                        disabled={acaoId === u.id}
                        onClick={() => void onAprovar(u.id)}
                      >
                        {acaoId === u.id ? "…" : "Reaprovar"}
                      </button>
                    )}
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
