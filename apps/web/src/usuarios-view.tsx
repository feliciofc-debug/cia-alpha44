import type { LoginEventoAdmin, UsuarioAdmin } from "./lib/api.ts";

function fmtData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
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

const EVENTO_LABEL: Record<LoginEventoAdmin["motivo"], string> = {
  ok: "Login OK",
  bloqueado: "Bloqueado",
  pendente: "Pendente",
  senha_errada: "Senha errada",
};

const EVENTO_STYLE: Record<LoginEventoAdmin["motivo"], string> = {
  ok: "bg-emerald-500/20 text-emerald-300",
  bloqueado: "bg-red-500/25 text-red-200 ring-1 ring-red-400/30",
  pendente: "bg-amber-500/20 text-amber-300",
  senha_errada: "bg-slate-500/20 text-slate-300",
};

export function UsuariosView({
  usuarios,
  loginEventos,
  loading,
  acaoId,
  onAprovar,
  onBloquear,
}: {
  usuarios: UsuarioAdmin[];
  loginEventos: LoginEventoAdmin[];
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
                <th className="px-4 py-3">Último login</th>
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
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtData(u.ultimoLoginEm)}</td>
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

      <section className="rounded-xl border border-white/10 bg-ink-900/40">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Atividade recente</h3>
          <p className="text-xs text-slate-500">Últimas 20 tentativas de login, horário de Brasília.</p>
        </div>
        {loginEventos.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Nenhuma tentativa de login registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-800/60 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Data/hora</th>
                  <th className="px-4 py-3">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {loginEventos.map((ev) => (
                  <tr
                    key={ev.id}
                    className={`border-t border-white/5 ${
                      ev.motivo === "bloqueado" ? "bg-red-500/10" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-200">{ev.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{fmtData(ev.criadoEm)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EVENTO_STYLE[ev.motivo]}`}>
                        {EVENTO_LABEL[ev.motivo]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
