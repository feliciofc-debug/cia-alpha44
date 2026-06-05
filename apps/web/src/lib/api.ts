import type {
  Cotacao,
  CotacaoLista,
  CotacaoSalva,
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
    const cotacao: Cotacao = {
      cliente: "Análise importação",
      benefFiscal: "ALAGOAS",
      moeda: "US$",
      cambio: cambio.cotacaoVenda ?? 5.2,
      freteTotalUS: 0,
      adicionaisVaUS: 0,
      reducaoBaseUS: 0,
      siscomex: 154.23,
      antidumpingBRL: 0,
      incoterm: "CFR",
      origem: "RJ",
      destino: "SP",
      itens,
      despesas: [],
      params: {
        markupPct: 0.06,
        pisSaida: 0.0165,
        cofinsSaida: 0.076,
        icmsSaida: 0.04,
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
      cotacao,
    };
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

  calcular: (cotacao: Cotacao) =>
    fetch(`${BASE}/api/calcular`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cotacao),
    }).then(handle<{ resultado: ResultadoCotacao; itens: Item[] }>),
};
