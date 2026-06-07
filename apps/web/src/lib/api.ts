import { DESPESAS_PADRAO } from "./despesas.ts";
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
  benefFiscal: string;
}

export interface Cambio {
  moeda: string;
  cotacaoCompra: number | null;
  cotacaoVenda: number | null;
  dataCotacao: string | null;
  fonte: "PTAX" | "indisponível";
}

export const api = {
  meta: () => fetch(`${BASE}/api/meta`).then(handle<Meta>),
  cambio: (moeda = "USD") => fetch(`${BASE}/api/cambio?moeda=${moeda}`).then(handle<Cambio>),

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

    const comFob = itens.some((it) => it.fobTotalUS > 0);
    const cambio = await fetch(`${BASE}/api/cambio?moeda=USD`).then(handle<Cambio>);
    const benefFiscal = "ALAGOAS";
    const origem = "RJ";
    const destino = "SP";
    const cotacao: Cotacao = {
      empresaTrade: "Alpha 44",
      cliente: "Análise importação",
      benefFiscal,
      moeda: "US$",
      cambio: cambio.cotacaoVenda ?? 5.2,
      freteTotalUS: 0,
      adicionaisVaUS: 0,
      reducaoBaseUS: 0,
      siscomex: 154.23,
      antidumpingBRL: 0,
      incoterm: "CFR",
      origem,
      destino,
      itens,
      despesas: DESPESAS_PADRAO.map((d) => ({ ...d })),
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
    return {
      itens: itensCalc,
      provider,
      resultado: comFob ? resultado : null,
      avisoFiscal: comFob
        ? null
        : "Planilha sem FOB/preços — NCM e risco analisados; totais fiscais quando houver valores.",
      cotacao: { ...cotacao, itens: itensCalc },
    };
  },

  dashboardKpis: () => fetch(`${BASE}/api/dashboard/kpis`).then(handle<DashboardKpis>),

  dashboardSeries: (meses = 12) =>
    fetch(`${BASE}/api/dashboard/series?meses=${meses}`).then(handle<DashboardSeries>),

  dashboardClientes: (q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return fetch(`${BASE}/api/dashboard/clientes${qs}`).then(handle<{ total: number; clientes: ClienteResumo[] }>);
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
    return fetch(`${BASE}/api/cotacoes${q}`).then(handle<CotacaoLista>);
  },

  buscarCotacao: (id: string) => fetch(`${BASE}/api/cotacoes/${id}`).then(handle<CotacaoSalva>),

  salvarCotacao: (payload: {
    cotacao: Cotacao;
    itens: Item[];
    resultado: ResultadoCotacao | null;
    provider?: string;
  }) =>
    fetch(`${BASE}/api/cotacoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle<CotacaoSalva>),

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

  listarUfs: (benefFiscal = "ALAGOAS") =>
    fetch(`${BASE}/api/fiscal/ufs?benefFiscal=${encodeURIComponent(benefFiscal)}`).then(
      handle<{
        ufs: { sigla: string; nome: string; icmsInterno: number; icmsEfetivoSaida: number }[];
      }>,
    ),
};
