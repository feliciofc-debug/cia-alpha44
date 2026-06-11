import { despesasParaContainers, outrasDespesasBaseParaContainers, DEFAULT_FRETE_US, DEFAULT_SISCOMEX_BRL } from "./despesas.ts";
import { icmsSaidaParaDestino } from "./icms-uf.ts";
import type {
  Cotacao,
  CotacaoLista,
  CotacaoSalva,
  ClienteResumo,
  DashboardKpis,
  DashboardSeries,
  RelatorioFaturamento,
  Item,
  ParsedSheet,
  ResultadoCotacao,
} from "./types";

export interface AnaliseCompleta {
  itens: Item[];
  provider: string;
  resultado: ResultadoCotacao | null;
  avisoFiscal: string | null;
  cotacao: Cotacao;
}

/** Vazio = proxy local do Vite (`/api` → localhost:3333). Produção: HTTPS direto na VPS. */
const BASE = (import.meta.env.VITE_API_URL as string) || "";

const PARSE_TIMEOUT_MS = 120_000;
const CLASSIFY_TIMEOUT_MS = 600_000;
const PDF_TIMEOUT_MS = 180_000;
const API_TIMEOUT_MS = 30_000;
const SALVAR_TIMEOUT_MS = 180_000;

function fetchComTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

export interface Meta {
  provider: string;
  llmDisponivel: boolean;
  ocrProvider?: string;
  ocrDisponivel?: boolean;
  comexTotal: number;
  ncmVigenteTotal?: number;
  ncmVigenteAtualizado?: string | null;
  benefFiscal: string;
}

export interface Cambio {
  moeda: string;
  cotacaoCompra: number | null;
  cotacaoVenda: number | null;
  dataCotacao: string | null;
  fonte: "PTAX" | "indisponível";
}

export interface BenchmarkPlanilhaStatus {
  carregado: boolean;
  total: number;
  arquivo: string | null;
  atualizadoEm: string | null;
  contexto: string | null;
  fonte?: string;
  path?: string;
  prioridade?: string;
}

export const api = {
  meta: () => fetchComTimeout(`${BASE}/api/meta`, {}, API_TIMEOUT_MS).then(handle<Meta>),
  cambio: (moeda = "USD") =>
    fetchComTimeout(`${BASE}/api/cambio?moeda=${moeda}`, {}, API_TIMEOUT_MS).then(handle<Cambio>),

  parse: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetchComTimeout(`${BASE}/api/parse`, { method: "POST", body: fd }, PARSE_TIMEOUT_MS).then(
      handle<ParsedSheet>,
    );
  },

  classificar: (linhas: ParsedSheet["linhas"]) =>
    fetchComTimeout(
      `${BASE}/api/classificar`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linhas }),
      },
      CLASSIFY_TIMEOUT_MS,
    ).then(handle<{ itens: Item[]; provider: string }>),

  analisar: async (linhas: ParsedSheet["linhas"]): Promise<AnaliseCompleta> => {
    const { itens, provider } = await fetchComTimeout(
      `${BASE}/api/classificar`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linhas }),
      },
      CLASSIFY_TIMEOUT_MS,
    ).then(handle<{ itens: Item[]; provider: string }>);

    const comFobPlanilha = itens.some((it) => it.fobTotalUS > 0);
    const cambio = await fetch(`${BASE}/api/cambio?moeda=USD`).then(handle<Cambio>);
    const benefFiscal = "ALAGOAS";
    const origem = "RJ";
    const destino = "SP";
    const qtdContainers = 1;
    const cotacao: Cotacao = {
      empresaTrade: "Alpha 44",
      cliente: "Análise importação",
      benefFiscal,
      moeda: "US$",
      cambio: cambio.cotacaoVenda ?? 5.2,
      freteTotalUS: DEFAULT_FRETE_US,
      adicionaisVaUS: 0,
      reducaoBaseUS: 0,
      siscomex: DEFAULT_SISCOMEX_BRL,
      antidumpingBRL: 0,
      incoterm: "CFR",
      origem,
      destino,
      itens,
      qtdContainers,
      despesas: despesasParaContainers(qtdContainers),
      outrasDespesasBaseBRL: outrasDespesasBaseParaContainers(qtdContainers),
      params: {
        markupPct: 0.06,
        pisSaida: 0.0165,
        cofinsSaida: 0.076,
        icmsSaida: icmsSaidaParaDestino(destino, benefFiscal),
        csllSobreMarkup: 0.09,
        irrfAliq: 0.25,
        irrfBaseNotaPct: 0.027,
        ipiTetoAliqMedia: 0.15,
        icmsEntrada: 0,
      },
    };
    const { resultado, itens: itensCalc } = await fetchComTimeout(
      `${BASE}/api/calcular`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cotacao),
      },
      CLASSIFY_TIMEOUT_MS,
    ).then(handle<{ resultado: ResultadoCotacao; itens: Item[] }>);
    const fobEngine = resultado.entrada.fobTotalUS;
    const temResultado = fobEngine > 0 && resultado.totalBRL > 0;
    return {
      itens: itensCalc,
      provider,
      resultado: temResultado ? resultado : null,
      avisoFiscal: temResultado
        ? !comFobPlanilha
          ? "FOB estimado via benchmark ComexStat onde a planilha não tinha preço."
          : null
        : "Informe FOB na planilha ou confira peso/NCM para estimativa ComexStat.",
      cotacao: { ...cotacao, itens: itensCalc },
    };
  },

  dashboardKpis: () => fetchComTimeout(`${BASE}/api/dashboard/kpis`, {}, API_TIMEOUT_MS).then(handle<DashboardKpis>),

  dashboardSeries: (meses = 12) =>
    fetchComTimeout(`${BASE}/api/dashboard/series?meses=${meses}`, {}, API_TIMEOUT_MS).then(handle<DashboardSeries>),

  dashboardClientes: (q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return fetchComTimeout(`${BASE}/api/dashboard/clientes${qs}`, {}, API_TIMEOUT_MS).then(
      handle<{ total: number; clientes: ClienteResumo[] }>,
    );
  },

  relatorioFaturamento: (ano: number, mes?: number) => {
    const params = new URLSearchParams({ ano: String(ano) });
    if (mes != null) params.set("mes", String(mes));
    return fetch(`${BASE}/api/dashboard/relatorio?${params}`).then(handle<RelatorioFaturamento>);
  },

  baixarRelatorioFaturamentoPdf: async (ano: number, mes?: number) => {
    const params = new URLSearchParams({ ano: String(ano) });
    if (mes != null) params.set("mes", String(mes));
    const res = await fetch(`${BASE}/api/dashboard/relatorio/pdf?${params}`);
    const slug = mes != null ? `${ano}-${String(mes).padStart(2, "0")}` : String(ano);
    return api.baixarPdfBlob(res, `cia-faturamento-${slug}.pdf`);
  },

  listarCotacoes: (cliente?: string) => {
    const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";
    return fetchComTimeout(`${BASE}/api/cotacoes${q}`, {}, API_TIMEOUT_MS).then(handle<CotacaoLista>);
  },

  buscarCotacao: (id: string) =>
    fetchComTimeout(`${BASE}/api/cotacoes/${id}`, {}, API_TIMEOUT_MS).then(handle<CotacaoSalva>),

  salvarCotacao: (payload: {
    cotacao: Cotacao;
    itens: Item[];
    resultado: ResultadoCotacao | null;
    provider?: string;
  }) =>
    fetchComTimeout(
      `${BASE}/api/cotacoes`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      SALVAR_TIMEOUT_MS,
    ).then(handle<CotacaoSalva>),

  duplicarCotacao: (id: string, opts?: { markupPct?: number; cliente?: string }) =>
    fetch(`${BASE}/api/cotacoes/${id}/duplicar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts ?? {}),
    }).then(handle<CotacaoSalva>),

  excluirCotacao: (id: string) =>
    fetch(`${BASE}/api/cotacoes/${id}`, { method: "DELETE" }).then(handle<{ ok: true }>),

  calcular: (cotacao: Cotacao) =>
    fetch(`${BASE}/api/calcular`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cotacao),
    }).then(handle<{ resultado: ResultadoCotacao; itens: Item[] }>),

  atualizarCotacao: (id: string, opts: Record<string, unknown>) =>
    fetch(`${BASE}/api/cotacoes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts),
    }).then(handle<CotacaoSalva>),

  confirmarNcmItem: (cotacaoId: string, ordem: number, confirmadoPor?: string) =>
    fetch(`${BASE}/api/cotacoes/${cotacaoId}/itens/${ordem}/confirmar-ncm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(confirmadoPor ? { confirmadoPor } : {}),
    }).then(handle<CotacaoSalva>),

  desfazerNcmItem: (cotacaoId: string, ordem: number) =>
    fetch(`${BASE}/api/cotacoes/${cotacaoId}/itens/${ordem}/desfazer-ncm`, {
      method: "POST",
    }).then(handle<CotacaoSalva>),

  /** @deprecated use atualizarCotacao */
  atualizarFiscal: (id: string, opts: Record<string, unknown>) =>
    fetch(`${BASE}/api/cotacoes/${id}/fiscal`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts),
    }).then(handle<CotacaoSalva>),

  baixarPdfBlob: async (res: Response, fallback: string) => {
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      type PdfErroJson = {
        erro?: string;
        codigo?: string;
        itensInvalidos?: { ordem: number; descricao: string; ncm: string }[];
      };
      let parsed: PdfErroJson | null = null;
      try {
        parsed = JSON.parse(txt) as PdfErroJson;
      } catch {
        /* resposta não-JSON */
      }
      if (parsed?.erro) {
        let msg = parsed.erro;
        if (parsed.codigo === "NCM_INVALIDO" && parsed.itensInvalidos?.length) {
          const linhas = parsed.itensInvalidos
            .slice(0, 5)
            .map((x) => `#${x.ordem} ${x.descricao} (${x.ncm})`);
          msg += " — " + linhas.join("; ");
        }
        throw new Error(msg);
      }
      throw new Error(txt || `Falha ao gerar PDF (${res.status})`);
    }
    const blob = await res.blob();
    const disp = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disp);
    const filename = match?.[1] ?? fallback;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  baixarPdf: async (id: string, tipo: "cliente" | "trade") => {
    const res = await fetchComTimeout(`${BASE}/api/cotacoes/${id}/pdf?tipo=${tipo}`, {}, PDF_TIMEOUT_MS);
    return api.baixarPdfBlob(res, `cia-${tipo}.pdf`);
  },

  previewPdf: async (
    payload: {
      cotacao: Cotacao;
      itens: Item[];
      resultado: ResultadoCotacao | null;
    },
    tipo: "cliente" | "trade" = "cliente",
  ) => {
    const res = await fetchComTimeout(
      `${BASE}/api/cotacoes/preview-pdf?tipo=${tipo}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      PDF_TIMEOUT_MS,
    );
    return api.baixarPdfBlob(res, `cia-preview-${tipo}.pdf`);
  },

  exportarConciliacaoSalva: async (id: string, formato: "xlsx" | "csv" = "xlsx") => {
    const res = await fetchComTimeout(
      `${BASE}/api/cotacoes/${id}/conciliacao?formato=${formato}`,
      {},
      PDF_TIMEOUT_MS,
    );
    return api.baixarPdfBlob(res, `conciliacao.${formato}`);
  },

  exportarConciliacaoAnalise: async (
    payload: {
      cotacao: Cotacao;
      itens: Item[];
      resultado: ResultadoCotacao | null;
      provider?: string | null;
    },
    formato: "xlsx" | "csv" = "xlsx",
  ) => {
    const res = await fetchComTimeout(
      `${BASE}/api/conciliacao/export?formato=${formato}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cotacao: payload.cotacao,
          itens: payload.itens,
          resultado: payload.resultado,
          provider: payload.provider,
        }),
      },
      PDF_TIMEOUT_MS,
    );
    return api.baixarPdfBlob(res, `conciliacao.${formato}`);
  },

  benchmarkPlanilhaStatus: () =>
    fetchComTimeout(`${BASE}/api/benchmark/planilha/status`, {}, API_TIMEOUT_MS).then(
      handle<BenchmarkPlanilhaStatus>,
    ),

  uploadBenchmarkPlanilha: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetchComTimeout(`${BASE}/api/benchmark/planilha/upload`, { method: "POST", body: fd }, PARSE_TIMEOUT_MS);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      try {
        const j = JSON.parse(txt) as { erro?: string };
        if (j.erro) throw new Error(j.erro);
      } catch (e) {
        if (e instanceof Error && e.message !== txt) throw e;
      }
      throw new Error(txt || `Upload falhou (${res.status})`);
    }
    return res.json() as Promise<{
      ok: boolean;
      total: number;
      mensagem: string;
      arquivo: string;
      atualizadoEm: string;
    }>;
  },

  listarUfs: (benefFiscal = "ALAGOAS") =>
    fetch(`${BASE}/api/fiscal/ufs?benefFiscal=${encodeURIComponent(benefFiscal)}`).then(
      handle<{
        ufs: { sigla: string; nome: string; icmsInterno: number; icmsEfetivoSaida: number }[];
      }>,
    ),
};
