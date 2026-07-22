import { useEffect, useState } from "react";
import { useAuth } from "./auth/auth.tsx";
import { Dashboard } from "./dashboard.tsx";
import { api, type Meta } from "./lib/api.ts";

function IconOlhoAberto() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconOlhoFechado() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10.7 10.7a3 3 0 0 0 4.2 4.2M9.9 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-3.2 4.5M6.1 6.1C3.5 8 2 12 2 12a18.2 18.2 0 0 0 5.1 5.9M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type AuthTab = "entrar" | "criar";

export function LoginScreen() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<AuthTab>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(null));
  }, []);

  function trocarTab(nova: AuthTab) {
    setTab(nova);
    setErro("");
    setSucesso("");
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setLoading(true);
    try {
      await login(email, senha);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "E-mail ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setLoading(true);
    try {
      const msg = await register(nome, email, senha);
      setSucesso(msg);
      setSenha("");
      setNome("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-ink-900">
      <div className="pointer-events-none fixed inset-0 bg-grid-faint bg-[size:48px_48px] opacity-40" />
      <div className="pointer-events-none fixed -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />

      <div className="container-cia relative flex min-h-screen flex-col items-center justify-center py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-lg font-black text-white shadow-glow">
            α
          </div>
          <h1 className="text-2xl font-bold text-white">CIA / Alpha 44</h1>
          <p className="mt-2 text-sm text-slate-400">Sistema de Cotação de Importação</p>
          {meta && (
            <p className="mt-3 text-xs text-slate-500">
              API online · {meta.comexTotal.toLocaleString("pt-BR")} NCMs no benchmark
            </p>
          )}
        </div>

        <div className="card w-full max-w-md p-8 shadow-glow">
          <div className="mb-6 flex gap-2 rounded-lg bg-ink-800/80 p-1">
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                tab === "entrar" ? "bg-brand-500/30 text-white" : "text-slate-400 hover:text-white"
              }`}
              onClick={() => trocarTab("entrar")}
            >
              Entrar
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                tab === "criar" ? "bg-brand-500/30 text-white" : "text-slate-400 hover:text-white"
              }`}
              onClick={() => trocarTab("criar")}
            >
              Criar conta
            </button>
          </div>

          {tab === "entrar" ? (
            <>
              <h2 className="mb-6 text-xl font-bold text-white">Entrar</h2>
              <form onSubmit={submitLogin} className="space-y-4">
                <div>
                  <label className="label" htmlFor="login-email">
                    E-mail
                  </label>
                  <input
                    id="login-email"
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="voce@empresa.com.br"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="login-senha">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="login-senha"
                      className="input pr-10"
                      type={mostrarSenha ? "text" : "password"}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-white"
                      onClick={() => setMostrarSenha((v) => !v)}
                      aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                      tabIndex={-1}
                    >
                      {mostrarSenha ? <IconOlhoFechado /> : <IconOlhoAberto />}
                    </button>
                  </div>
                </div>
                {erro && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100 shadow-lg shadow-red-950/20"
                  >
                    {erro}
                  </div>
                )}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? "Aguarde…" : "Entrar"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="mb-2 text-xl font-bold text-white">Criar conta</h2>
              <p className="mb-6 text-sm text-slate-400">
                Preencha seus dados. Um administrador precisa aprovar antes do primeiro acesso.
              </p>
              <form onSubmit={submitRegister} className="space-y-4">
                <div>
                  <label className="label" htmlFor="register-nome">
                    Nome
                  </label>
                  <input
                    id="register-nome"
                    className="input"
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    minLength={2}
                    autoComplete="name"
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="register-email">
                    E-mail
                  </label>
                  <input
                    id="register-email"
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="voce@empresa.com.br"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="register-senha">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="register-senha"
                      className="input pr-10"
                      type={mostrarSenha ? "text" : "password"}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-white"
                      onClick={() => setMostrarSenha((v) => !v)}
                      aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                      tabIndex={-1}
                    >
                      {mostrarSenha ? <IconOlhoFechado /> : <IconOlhoAberto />}
                    </button>
                  </div>
                </div>
                {erro && <p className="text-sm text-red-400">{erro}</p>}
                {sucesso && <p className="text-sm text-emerald-400">{sucesso}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? "Enviando…" : "Criar conta"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-900 text-slate-400">
        Carregando…
      </div>
    );
  }

  if (user) return <Dashboard />;

  return <LoginScreen />;
}
