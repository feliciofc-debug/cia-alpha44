import { useEffect, useState } from "react";
import { useAuth } from "./auth/auth.tsx";
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

function Dashboard() {
  const { user, logout } = useAuth();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [erro, setErro] = useState("");
  const [parsed, setParsed] = useState<Awaited<ReturnType<typeof api.parse>> | null>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {});
  }, []);

  async function processarArquivo(file: File) {
    setErro("");
    setParsed(null);
    setUploading(true);
    try {
      const resultado = await api.parse(file);
      setParsed(resultado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao processar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void processarArquivo(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processarArquivo(file);
  }

  return (
    <div className="min-h-full bg-ink-900">
      <header className="border-b border-white/5">
        <div className="container-cia flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-black text-white">
              α
            </div>
            <span className="font-semibold text-white">Nova cotação</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-400">{user?.email}</span>
            <button type="button" className="btn-ghost py-1.5" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="container-cia py-12">
        <div
          className={`card mx-auto max-w-2xl p-10 text-center transition-colors ${
            dragOver ? "border-brand-500/50 bg-brand-500/5" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/5 text-3xl">
            📄
          </div>
          <h2 className="text-xl font-bold text-white">Arraste a planilha do fornecedor</h2>
          <p className="mt-2 text-sm text-slate-400">
            .xlsx ou .csv · qualquer idioma · detecção automática de colunas
          </p>
          <label className={`btn-primary mt-8 inline-flex cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            {uploading ? "Processando…" : "Selecionar arquivo"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="sr-only"
              onChange={onFileChange}
              disabled={uploading}
            />
          </label>
          {erro && <p className="mt-4 text-sm text-red-400">{erro}</p>}
          {parsed && (
            <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-left text-sm">
              <p className="font-semibold text-white">
                ✓ {parsed.arquivo ?? "Arquivo"} — {parsed.totalLinhas} linha(s) detectada(s)
              </p>
              <p className="mt-1 text-slate-400">
                Aba: {parsed.abaUsada} · Colunas mapeadas: {parsed.colunas.length}
              </p>
              {parsed.avisos.length > 0 && (
                <p className="mt-2 text-amber-400/90">{parsed.avisos.join(" · ")}</p>
              )}
              <ul className="mt-3 space-y-1 text-slate-300">
                {parsed.linhas.slice(0, 5).map((l) => (
                  <li key={l.__row} className="truncate">
                    {l.descOriginal || "(sem descrição)"}
                    {l.fobTotalUS != null ? ` · FOB US$ ${l.fobTotalUS}` : ""}
                  </li>
                ))}
              </ul>
              {parsed.linhas.length > 5 && (
                <p className="mt-2 text-xs text-slate-500">+ {parsed.linhas.length - 5} itens…</p>
              )}
              <p className="mt-4 text-xs text-brand-300">
                Próxima etapa: classificação IA + grid fiscal (em construção).
              </p>
            </div>
          )}
          <p className="mt-6 text-xs text-slate-500">
            Upload → parser automático → classificação NCM → engine fiscal → exportação.
            {meta && ` · ${meta.comexTotal.toLocaleString("pt-BR")} NCMs no benchmark`}
          </p>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  function openLogin() {
    setAuthMode("login");
    setAuthOpen(true);
  }
  function openSignup() {
    setAuthMode("signup");
    setAuthOpen(true);
  }

  if (user) return <Dashboard />;

  return (
    <>
      <Landing onLogin={openLogin} onSignup={openSignup} />
      {authOpen && (
        <LoginModal onClose={() => setAuthOpen(false)} mode={authMode} setMode={setAuthMode} />
      )}
    </>
  );
}
