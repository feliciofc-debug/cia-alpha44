import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth/auth.tsx";
import { api, type AnaliseCompleta, type Meta } from "./lib/api.ts";
import { brl, fmtNcm, pct } from "./lib/format.ts";
import { extrairResumoFinanceiro, type ResumoFinanceiro } from "./lib/financeiro.ts";
import type { Canal, CotacaoResumo, CotacaoSalva, Item, ResultadoCotacao } from "./lib/types.ts";

type View = "lista" | "nova" | "detalhe";

const CANAL_LABEL: Record<Canal, string> = {
  VERDE_PROVAVEL: "Verde",
  AMARELO_TECNICO: "Amarelo",
  VERMELHO_TECNICO: "Vermelho",
  CINZA_VALORACAO: "Cinza",
};

const CANAL_STYLE: Record<Canal, string> = {
  VERDE_PROVAVEL: "bg-emerald-500/20 text-emerald-300",
  AMARELO_TECNICO: "bg-amber-500/20 text-amber-300",
  VERMELHO_TECNICO: "bg-red-500/20 text-red-300",
  CINZA_VALORACAO: "bg-slate-500/20 text-slate-300",
};

function resumoCanais(itens: Item[]) {
  const m: Record<string, number> = {};
  for (const it of itens) {
    const c = it.risco?.canal ?? "AMARELO_TECNICO";
    m[c] = (m[c] ?? 0) + 1;
  }
  return m;
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AnaliseView = AnaliseCompleta | CotacaoSalva;

function ResumoFinanceiroPainel({
  financeiro,
  resultado,
}: {
  financeiro: ResumoFinanceiro | null;
  resultado?: ResultadoCotacao | null;
}) {
  if (!financeiro) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Custo importação</p>
          <p className="mt-1 text-xl font-bold text-slate-200">{brl(financeiro.custoImportacaoBRL)}</p>
          <p className="mt-1 text-xs text-slate-500">Fixo — nacionalização (não muda com markup)</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-400/90">Impostos venda</p>
          <p className="mt-1 text-xl font-bold text-amber-200/90">{brl(financeiro.impostosSaidaBRL)}</p>
          <p className="mt-1 text-xs text-slate-500">ICMS + DIFs — variam com a margem</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">Lucro da trade</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">{brl(financeiro.markupBRL)}</p>
          <p className="mt-1 text-xs text-emerald-400/80">
            Markup {pct(financeiro.markupPct)} · líquido {brl(financeiro.lucroLiquidoTradeBRL)}
          </p>
        </div>
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-300">Total orçamento</p>
          <p className="mt-1 text-xl font-bold text-white">{brl(financeiro.totalOrcamentoBRL)}</p>
          <p className="mt-1 text-xs text-slate-400">Importação + impostos venda + margem</p>
        </div>
      </div>

      {resultado && (
        <details className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-slate-300">Detalhe fiscal (entrada + saída)</summary>
          <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <p>Impostos entrada: {brl(resultado.entrada.impostosEntradaTotal)}</p>
            <p>Taxas locais: {brl(resultado.saida.taxasLocaisTotalBRL)}</p>
            <p>Impostos saída: {brl(resultado.saida.impostosSaidaTotal)}</p>
            <p>CSLL s/ markup: {brl(resultado.saida.csll)}</p>
            <p>IRRF: {brl(resultado.saida.irrf)}</p>
            <p>Margem s/ custo: {pct(financeiro.margemSobreCustoPct)}</p>
          </div>
        </details>
      )}
    </div>
  );
}

function AnalisePainel({
  analise,
  cliente,
  onClienteChange,
  onSalvar,
  salvando,
  salvaId,
}: {
  analise: AnaliseView;
  cliente?: string;
  onClienteChange?: (v: string) => void;
  onSalvar?: () => void;
  salvando?: boolean;
  salvaId?: string | null;
}) {
  const itens = analise.itens;
  const provider = (analise as { provider?: string | null }).provider ?? "—";
  const canais = resumoCanais(itens);
  const financeiro =
    "financeiro" in analise && analise.financeiro
      ? analise.financeiro
      : extrairResumoFinanceiro(analise.resultado, analise.cotacao.params.markupPct);

  return (
    <div className="space-y-6 text-left">
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
        <p className="font-semibold text-white">
          {salvaId ? "Cotação salva" : "Análise concluída"}
          {salvaId && <span className="ml-2 text-xs font-normal text-slate-400">#{salvaId.slice(0, 8)}</span>}
        </p>
        <p className="mt-1 text-sm text-slate-300">
          Provedor: {provider} · {itens.length} itens · Benefício {analise.cotacao.benefFiscal}
        </p>
        {analise.avisoFiscal && <p className="mt-2 text-sm text-amber-300">{analise.avisoFiscal}</p>}
      </div>

      <ResumoFinanceiroPainel financeiro={financeiro} resultado={analise.resultado} />

      {!salvaId && onSalvar && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label">Cliente / processo</label>
            <input
              className="input"
              value={cliente ?? ""}
              onChange={(e) => onClienteChange?.(e.target.value)}
              placeholder="Ex.: Luminárias China — Mar/2026"
            />
          </div>
          <button type="button" className="btn-primary shrink-0" disabled={salvando} onClick={onSalvar}>
            {salvando ? "Salvando…" : "Salvar cotação"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(Object.entries(canais) as [Canal, number][]).map(([canal, qtd]) => (
          <span key={canal} className={`rounded-full px-3 py-1 text-xs font-medium ${CANAL_STYLE[canal]}`}>
            {CANAL_LABEL[canal]}: {qtd}
          </span>
        ))}
      </div>

      <div className="max-h-96 overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-ink-800 text-slate-400">
            <tr>
              <th className="p-2">Descrição (PT)</th>
              <th className="p-2">NCM</th>
              <th className="p-2">FOB US$</th>
              <th className="p-2">Canal</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => (
              <tr key={i} className="border-t border-white/5 text-slate-300">
                <td className="max-w-xs p-2">
                  <div className="truncate font-medium text-white">{it.descPt || it.descOriginal}</div>
                  <div className="truncate text-slate-500">{it.descDuimp.slice(0, 80)}</div>
                </td>
                <td className="p-2 whitespace-nowrap">{fmtNcm(it.ncm || "00000000")}</td>
                <td className="p-2 whitespace-nowrap">{it.fobTotalUS > 0 ? it.fobTotalUS.toFixed(2) : "—"}</td>
                <td className="p-2">
                  {it.risco && (
                    <span className={`rounded px-2 py-0.5 ${CANAL_STYLE[it.risco.canal]}`}>
                      {CANAL_LABEL[it.risco.canal]}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModalDuplicar({
  cotacao,
  onClose,
  onConfirm,
  loading,
}: {
  cotacao: CotacaoResumo;
  onClose: () => void;
  onConfirm: (markupPct: number) => void;
  loading: boolean;
}) {
  const [markup, setMarkup] = useState(Math.min(0.25, cotacao.markupPct + 0.02));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-white">Duplicar com nova margem</h3>
        <p className="mt-2 text-sm text-slate-400">
          {cotacao.cliente} · markup atual {pct(cotacao.markupPct)}
        </p>
        <div className="mt-6">
          <label className="label">Novo markup — {pct(markup)}</label>
          <input
            type="range"
            min={0}
            max={0.25}
            step={0.005}
            value={markup}
            onChange={(e) => setMarkup(Number(e.target.value))}
            className="w-full accent-brand-500"
          />
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>0%</span>
            <span>25%</span>
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="btn-primary flex-1" disabled={loading} onClick={() => onConfirm(markup)}>
            {loading ? "Gerando…" : "Duplicar e recalcular"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>("lista");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState("");

  const [lista, setLista] = useState<CotacaoResumo[]>([]);
  const [totalHoje, setTotalHoje] = useState(0);
  const [listaLoading, setListaLoading] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<Awaited<ReturnType<typeof api.parse>> | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [analise, setAnalise] = useState<AnaliseCompleta | null>(null);
  const [cliente, setCliente] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvaId, setSalvaId] = useState<string | null>(null);

  const [detalhe, setDetalhe] = useState<CotacaoSalva | null>(null);
  const [dupAlvo, setDupAlvo] = useState<CotacaoResumo | null>(null);
  const [duplicando, setDuplicando] = useState(false);

  const carregarLista = useCallback(async () => {
    setListaLoading(true);
    try {
      const res = await api.listarCotacoes();
      setLista(res.cotacoes);
      setTotalHoje(res.totalHoje);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar cotações.");
    } finally {
      setListaLoading(false);
    }
  }, []);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {});
    void carregarLista();
  }, [carregarLista]);

  function irNova() {
    setView("nova");
    setErro("");
    setParsed(null);
    setAnalise(null);
    setSalvaId(null);
    setCliente("");
    setDetalhe(null);
  }

  async function abrirCotacao(id: string) {
    setErro("");
    try {
      const c = await api.buscarCotacao(id);
      setDetalhe(c);
      setView("detalhe");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao abrir cotação.");
    }
  }

  async function processarArquivo(file: File) {
    setErro("");
    setParsed(null);
    setAnalise(null);
    setSalvaId(null);
    setUploading(true);
    try {
      const resultado = await api.parse(file);
      setParsed(resultado);
      const base = file.name.replace(/\.[^.]+$/, "");
      setCliente(base);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao processar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function iniciarAnalise() {
    if (!parsed?.linhas.length) return;
    setErro("");
    setAnalisando(true);
    setAnalise(null);
    setSalvaId(null);
    try {
      const res = await api.analisar(parsed.linhas);
      setAnalise(res);
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.name === "AbortError"
            ? "Análise demorou demais — tente com menos linhas."
            : e.message
          : "Falha na análise IA.",
      );
    } finally {
      setAnalisando(false);
    }
  }

  async function salvarAnalise() {
    if (!analise) return;
    setSalvando(true);
    setErro("");
    try {
      const cotacao = { ...analise.cotacao, cliente: cliente.trim() || "Sem cliente" };
      const salva = await api.salvarCotacao({
        cotacao,
        itens: analise.itens,
        resultado: analise.resultado,
        provider: analise.provider,
      });
      setSalvaId(salva.id);
      await carregarLista();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarDuplicar(markupPct: number) {
    if (!dupAlvo) return;
    setDuplicando(true);
    setErro("");
    try {
      const nova = await api.duplicarCotacao(dupAlvo.id, { markupPct });
      setDupAlvo(null);
      await carregarLista();
      setDetalhe(nova);
      setView("detalhe");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao duplicar.");
    } finally {
      setDuplicando(false);
    }
  }

  return (
    <div className="min-h-full bg-ink-900">
      <header className="border-b border-white/5">
        <div className="container-cia flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-black text-white">
              α
            </div>
            <nav className="flex gap-1 text-sm">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 ${view === "lista" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
                onClick={() => {
                  setView("lista");
                  void carregarLista();
                }}
              >
                Cotações
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 ${view === "nova" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
                onClick={irNova}
              >
                Nova
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {totalHoje > 0 && (
              <span className="hidden rounded-full bg-brand-500/20 px-3 py-1 text-xs font-medium text-brand-300 sm:inline">
                {totalHoje} hoje
              </span>
            )}
            <span className="text-slate-400">{user?.email}</span>
            <button type="button" className="btn-ghost py-1.5" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="container-cia py-8">
        {erro && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {erro}
          </p>
        )}

        {view === "lista" && (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-white">Minhas cotações</h2>
                <p className="text-sm text-slate-400">{lista.length} processo(s) salvos</p>
              </div>
              <button type="button" className="btn-primary" onClick={irNova}>
                + Nova cotação
              </button>
            </div>
            {listaLoading ? (
              <p className="p-8 text-center text-slate-400">Carregando…</p>
            ) : lista.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-400">Nenhuma cotação salva ainda.</p>
                <button type="button" className="btn-primary mt-4" onClick={irNova}>
                  Criar primeira cotação
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ink-800/80 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Cliente</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Itens</th>
                      <th className="px-4 py-3">Custo import.</th>
                      <th className="px-4 py-3">Lucro trade</th>
                      <th className="px-4 py-3">Orçamento</th>
                      <th className="px-4 py-3">Canal</th>
                      <th className="px-6 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((c) => (
                      <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                        <td className="px-6 py-3 font-medium text-white">{c.cliente}</td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtData(c.criadoEm)}</td>
                        <td className="px-4 py-3 text-slate-300">{c.totalItens}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {c.custoImportacaoBRL != null ? brl(c.custoImportacaoBRL) : "—"}
                        </td>
                        <td className="px-4 py-3 font-medium text-emerald-300">
                          {c.markupBRL != null ? (
                            <>
                              {brl(c.markupBRL)}
                              <span className="ml-1 text-xs text-emerald-500/80">({pct(c.markupPct)})</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          {c.totalBRL != null ? brl(c.totalBRL) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {c.canalPredominante && (
                            <span className={`rounded px-2 py-0.5 text-xs ${CANAL_STYLE[c.canalPredominante]}`}>
                              {CANAL_LABEL[c.canalPredominante]}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button type="button" className="btn-ghost py-1 text-xs" onClick={() => void abrirCotacao(c.id)}>
                            Abrir
                          </button>
                          <button type="button" className="btn-ghost ml-1 py-1 text-xs" onClick={() => setDupAlvo(c)}>
                            Duplicar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view === "detalhe" && detalhe && (
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{detalhe.cotacao.cliente}</h2>
                <p className="text-sm text-slate-400">Salva em {fmtData(detalhe.criadoEm)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    setDupAlvo({
                      id: detalhe.id,
                      cliente: detalhe.cotacao.cliente,
                      status: detalhe.status,
                      totalBRL: detalhe.totalBRL,
                      canalPredominante: detalhe.canalPredominante,
                      markupPct: detalhe.cotacao.params.markupPct,
                      markupBRL: detalhe.financeiro?.markupBRL ?? null,
                      lucroLiquidoTradeBRL: detalhe.financeiro?.lucroLiquidoTradeBRL ?? null,
                      custoImportacaoBRL: detalhe.financeiro?.custoImportacaoBRL ?? null,
                      impostosSaidaBRL: detalhe.financeiro?.impostosSaidaBRL ?? null,
                      custoOperacionalBRL: detalhe.financeiro?.custoImportacaoBRL ?? null,
                      totalItens: detalhe.itens.length,
                      criadoEm: detalhe.criadoEm,
                    })
                  }
                >
                  Duplicar + margem
                </button>
                <button type="button" className="btn-ghost" onClick={() => setView("lista")}>
                  Voltar
                </button>
              </div>
            </div>
            <div className="card p-6">
              <AnalisePainel analise={detalhe} salvaId={detalhe.id} />
            </div>
          </div>
        )}

        {view === "nova" && (
          <div
            className={`card mx-auto max-w-4xl p-10 text-center transition-colors ${
              dragOver ? "border-brand-500/50 bg-brand-500/5" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void processarArquivo(file);
            }}
          >
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/5 text-3xl">
              📄
            </div>
            <h2 className="text-xl font-bold text-white">Arraste a planilha do fornecedor</h2>
            <p className="mt-2 text-sm text-slate-400">.xlsx · .csv · .pdf · imagem</p>
            <label className={`btn-primary mt-8 inline-flex cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? "Processando…" : "Selecionar arquivo"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void processarArquivo(file);
                  e.target.value = "";
                }}
                disabled={uploading}
              />
            </label>

            {parsed && (
              <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4 text-left text-sm">
                <p className="font-semibold text-white">
                  ✓ {parsed.arquivo ?? "Arquivo"} — {parsed.totalLinhas} linha(s)
                </p>
                {!analise && (
                  <button
                    type="button"
                    className="btn-primary mt-6 w-full"
                    disabled={analisando}
                    onClick={() => void iniciarAnalise()}
                  >
                    {analisando ? `Analisando ${parsed.totalLinhas} itens…` : `Analisar com IA (${parsed.totalLinhas} itens)`}
                  </button>
                )}
              </div>
            )}

            {analise && (
              <div className="mt-8">
                <AnalisePainel
                  analise={analise}
                  cliente={cliente}
                  onClienteChange={setCliente}
                  onSalvar={() => void salvarAnalise()}
                  salvando={salvando}
                  salvaId={salvaId}
                />
                {salvaId && (
                  <button type="button" className="btn-ghost mt-4 w-full" onClick={() => void abrirCotacao(salvaId)}>
                    Ver cotação salva →
                  </button>
                )}
              </div>
            )}

            <p className="mt-6 text-xs text-slate-500">
              Upload → IA → salvar → histórico · {meta?.comexTotal.toLocaleString("pt-BR")} NCMs no benchmark
            </p>
          </div>
        )}
      </main>

      {dupAlvo && (
        <ModalDuplicar
          cotacao={dupAlvo}
          onClose={() => setDupAlvo(null)}
          onConfirm={(m) => void confirmarDuplicar(m)}
          loading={duplicando}
        />
      )}
    </div>
  );
}
