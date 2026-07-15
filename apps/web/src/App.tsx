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

function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      await login(email, senha);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "E-mail ou senha incorretos.");
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
          <h2 className="mb-6 text-xl font-bold text-white">Entrar</h2>
          <form onSubmit={submit} className="space-y-4">
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
            {erro && <p className="text-sm text-red-400">{erro}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Aguarde…" : "Entrar"}
            </button>
          </form>
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
