import { SignIn, SignUp } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { authUsaClerk, useAuth } from "./auth/auth.tsx";
import { Dashboard } from "./dashboard.tsx";
import { api, type Meta } from "./lib/api.ts";

const FEATURES = [
  {
    title: "Upload inteligente",
    desc: "Planilha do fornecedor em qualquer idioma — chinês, inglês, etc. Detecção automática de colunas.",
  },
  {
    title: "Tradução + NCM + DUIMP",
    desc: "IA traduz, classifica NCM contra Siscomex e gera descrição defensável para a DUIMP.",
  },
  {
    title: "Engine fiscal CIA",
    desc: "Nacionalização completa validada: II, IPI, PIS, COFINS, ICMS saída 4%, markup e total.",
  },
  {
    title: "Benchmark ComexStat",
    desc: "Calibra FOB/KG contra estatísticas reais. Sem base → honestidade: nunca finge validação.",
  },
  {
    title: "Canal aduaneiro",
    desc: "Score de risco por item: verde, amarelo, vermelho ou cinza (valoração).",
  },
  {
    title: "Exportação",
    desc: "Orçamento na tela + Excel com fórmulas abertas + PDF comercial em segundos.",
  },
];

function LoginModal({
  onClose,
  mode,
  setMode,
}: {
  onClose: () => void;
  mode: "login" | "signup";
  setMode: (m: "login" | "signup") => void;
}) {
  const { login, signup } = useAuth();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      if (mode === "login") await login(email, senha);
      else await signup(nome, email, senha);
      onClose();
    } catch {
      setErro("Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-8 shadow-glow animate-fade-up">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {mode === "login" ? "Entrar" : "Criar conta"}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="label">Nome</label>
              <input
                className="input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                placeholder="Seu nome"
              />
            </div>
          )}
          <div>
            <label className="label">E-mail</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@empresa.com.br"
            />
          </div>
          <div>
            <label className="label">Senha</label>
            <input
              className="input"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          {mode === "login" && (
            <p className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-slate-400">
              Acesso demonstração: <span className="text-slate-200">demo@cia-alpha44.com.br</span>
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Cadastrar"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          {mode === "login" ? (
            <>
              Sem conta?{" "}
              <button type="button" className="text-brand-400 hover:underline" onClick={() => setMode("signup")}>
                Cadastre-se
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button type="button" className="text-brand-400 hover:underline" onClick={() => setMode("login")}>
                Entrar
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Landing({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(null));
  }, []);

  return (
    <div className="min-h-full">
      <div className="pointer-events-none fixed inset-0 bg-grid-faint bg-[size:48px_48px] opacity-40" />
      <div className="pointer-events-none fixed -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />

      <header className="relative border-b border-white/5">
        <div className="container-cia flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 font-black text-white shadow-glow">
              α
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">CIA / Alpha 44</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Cotação de Importação</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
            <a href="#como" className="hover:text-white">Como funciona</a>
            <a href="#recursos" className="hover:text-white">Recursos</a>
          </nav>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost hidden sm:inline-flex" onClick={onLogin}>
              Entrar
            </button>
            <button type="button" className="btn-primary" onClick={onSignup}>
              Começar grátis
            </button>
          </div>
        </div>
      </header>

      <section className="relative py-20 md:py-28">
        <div className="container-cia text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold text-brand-300 animate-fade-up">
            Operação que levava dias → entregue na hora
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-black tracking-tight text-white md:text-6xl animate-fade-up [animation-delay:80ms]">
            Cotação de importação{" "}
            <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">
              defensável
            </span>{" "}
            em segundos
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 animate-fade-up [animation-delay:160ms]">
            Upload da planilha do fornecedor → tradução, NCM, nacionalização CIA/Alpha 44,
            benchmark ComexStat, análise de canal e orçamento (Excel + PDF).
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-up [animation-delay:240ms]">
            <button type="button" className="btn-primary px-8 py-3 text-base" onClick={onSignup}>
              Nova cotação
            </button>
            <button type="button" className="btn-ghost px-8 py-3 text-base" onClick={onLogin}>
              Já tenho conta
            </button>
          </div>
          {meta && (
            <p className="mt-8 text-xs text-slate-500 animate-fade-up [animation-delay:320ms]">
              API online · {meta.comexTotal.toLocaleString("pt-BR")} NCMs no benchmark · benefício {meta.benefFiscal}
            </p>
          )}
        </div>
      </section>

      <section id="como" className="relative border-t border-white/5 py-16">
        <div className="container-cia">
          <h2 className="mb-10 text-center text-2xl font-bold text-white">Pipeline em 10 passos</h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              "Parse planilha",
              "Traduz",
              "Classifica NCM",
              "DUIMP",
              "Alíquotas",
              "Benchmark",
              "Calibra FOB",
              "Engine fiscal",
              "Risco canal",
              "Exporta",
            ].map((s, i) => (
              <li key={s} className="card flex items-center gap-3 p-4 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-xs font-bold text-brand-300">
                  {i + 1}
                </span>
                <span className="text-slate-300">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="recursos" className="relative border-t border-white/5 py-16">
        <div className="container-cia">
          <h2 className="mb-10 text-center text-2xl font-bold text-white">O que o sistema faz</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="card p-6 transition hover:border-brand-500/30">
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-500">
        CIA / Alpha 44 · Sistema de Cotação de Importação · Benefício fiscal Alagoas
      </footer>
    </div>
  );
}

function ClerkAuthScreen() {
  const [tab, setTab] = useState<"login" | "signup">("login");

  return (
    <div className="min-h-full bg-ink-900">
      <div className="container-cia flex min-h-screen flex-col items-center justify-center py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-lg font-black text-white">
            α
          </div>
          <h1 className="text-2xl font-bold text-white">CIA / Alpha 44</h1>
          <p className="mt-2 text-sm text-slate-400">Sistema de Cotação de Importação</p>
        </div>
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm ${tab === "login" ? "bg-white/10 text-white" : "text-slate-400"}`}
            onClick={() => setTab("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm ${tab === "signup" ? "bg-white/10 text-white" : "text-slate-400"}`}
            onClick={() => setTab("signup")}
          >
            Criar conta
          </button>
        </div>
        {tab === "login" ? (
          <SignIn routing="hash" signUpUrl="#signup" />
        ) : (
          <SignUp routing="hash" signInUrl="#login" />
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { user, isLoaded } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const usaClerk = authUsaClerk();

  function openLogin() {
    setAuthMode("login");
    setAuthOpen(true);
  }
  function openSignup() {
    setAuthMode("signup");
    setAuthOpen(true);
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-900 text-slate-400">
        Carregando…
      </div>
    );
  }

  if (user) return <Dashboard />;

  if (usaClerk) return <ClerkAuthScreen />;

  return (
    <>
      <Landing onLogin={openLogin} onSignup={openSignup} />
      {authOpen && (
        <LoginModal onClose={() => setAuthOpen(false)} mode={authMode} setMode={setAuthMode} />
      )}
    </>
  );
}
