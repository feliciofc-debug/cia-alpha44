import { despesasParaContainers, outrasDespesasBaseParaContainers, DEFAULT_FRETE_US, DEFAULT_SISCOMEX_BRL } from "./despesas.ts";
import { icmsSaidaParaDestino } from "./icms-uf.ts";
import { PdfDownloadError, type ItemInvalidoPdf } from "./pdf-erro.ts";
import { fetchAutenticado } from "./auth-fetch.ts";
import { mesclarAvisoMoedaCotacao } from "@cia/shared";
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
  IcmsCotacaoMeta,
  AvisoValoracao,
} from "./types";

export interface AnaliseCompleta {
  itens: Item[];
  provider: string;
  resultado: ResultadoCotacao | null;
  avisoFiscal: string | null;
  cotacao: Cotacao;
  icms?: IcmsCotacaoMeta;
  avisosFiscais?: string[];
}

export { PdfDownloadError } from "./pdf-erro.ts";

/** Vazio = proxy local do Vite (`/api` → localhost:3333). Produção: HTTPS direto na VPS. */
const BASE = (import.meta.env.VITE_API_URL as string) || "";

export function apiBaseUrl(): string {
  return BASE;
}

const PARSE_TIMEOUT_MS = 120_000;
const CLASSIFY_TIMEOUT_MS = 600_000;
const PDF_TIMEOUT_MS = 180_000;
const API_TIMEOUT_MS = 30_000;
const SALVAR_TIMEOUT_MS = 180_000;
/** PATCH NCM + recálculo — pode demorar em cotações grandes. */
const NCM_ITEM_TIMEOUT_MS = 120_000;

function fetchComTimeout(
  url: string,
  init: RequestInit,
  ms: number,
  opts: { forceRefreshToken?: boolean } = {},
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetchAutenticado(url, { ...init, signal: ctrl.signal }, opts).finally(() => clearTimeout(timer));
}

function msgErroApi(status: number, txt: string): string {
  if (status === 401 && /jwt is expired|token expired|expirad/i.test(txt)) {
    return "Sessão expirada — você será redirecionado para entrar novamente.";
  }
  if (status === 401) {
    return "Não autenticado — faça login novamente.";
  }
  return `API ${status}: ${txt}`;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(msgErroApi(res.status, txt));
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
  avisoBannerMsg?: string | null;
  planilhaFobKg?: {
    carregado: boolean;
    total: number;
    arquivo: string | null;
    atualizadoEm: string | null;
    prioridade?: string;
  };
}

export interface TenantBranding {
  displayName: string;
  tagline: string | null;
  logoUrl: string | null;
  hasTenantBranding: boolean;
  brandingAtualizadoEm: string | null;
}

export interface Cambio {
  moeda: string;
  cotacaoCompra: number | null;
  cotacaoVenda: number | null;
  dataCotacao: string | null;
  fonte: "PTAX" | "indisponível";
}

export interface UsuarioAdmin {
  id: string;
  email: string;
  nome: string;
  status: "pendente" | "aprovado" | "bloqueado";
  role: "admin" | "operador";
  criadoEm: string;
  aprovadoEm: string | null;
  aprovadoPor: string | null;
  ultimoLoginEm: string | null;
}

export interface LoginEventoAdmin {
  id: string;
  usuarioId: string | null;
  email: string;
  sucesso: boolean;
  motivo: "ok" | "bloqueado" | "pendente" | "senha_errada";
  criadoEm: string;
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

export type ConciliacaoNcmStatus = "coerente" | "divergente" | "sem_sugestao";

export interface ConciliarNcmResult {
  ok: boolean;
  status: ConciliacaoNcmStatus;
  ncmInformado: string;
  ncmSugerido?: string;
  descricaoSugerida?: string;
  justificativaRGI?: string;
  confianca?: number;
  descricaoCiaInformado?: string | null;
  descricaoCiaSugerido?: string | null;
  alternativas?: Array<{ ncm: string; descricaoOficial?: string; motivo?: string; descricaoCia?: string | null }>;
  infoQueAjuda?: string;
  erro?: string;
}

export interface LookupNcmResult {
  ok: boolean;
  ncm?: string;
  existe?: boolean;
  descricaoOficial?: string;
  descricaoCia?: string | null;
  capitulo?: string;
  posicao?: string;
  exemplos?: string[];
  observacoes?: string;
  fonte?: "lovable" | "cia-catalog";
  erro?: string;
}

async function handleJsonAlways<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

function apiAssetUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE}${url}`;
}

export const api = {
  meta: () => fetchComTimeout(`${BASE}/api/meta`, {}, API_TIMEOUT_MS).then(handle<Meta>),
  tenantBranding: () =>
    fetchComTimeout(`${BASE}/api/tenant/branding`, {}, API_TIMEOUT_MS)
      .then(handle<TenantBranding>)
      .then((branding) => ({ ...branding, logoUrl: apiAssetUrl(branding.logoUrl) })),
  atualizarTenantBranding: (body: { displayName?: string | null; tagline?: string | null }) =>
    fetchComTimeout(
      `${BASE}/api/tenant/branding`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      API_TIMEOUT_MS,
    )
      .then(handle<TenantBranding>)
      .then((branding) => ({ ...branding, logoUrl: apiAssetUrl(branding.logoUrl) })),
  uploadTenantLogo: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetchComTimeout(`${BASE}/api/tenant/branding/logo`, { method: "POST", body: fd }, API_TIMEOUT_MS)
      .then(handle<TenantBranding>)
      .then((branding) => ({ ...branding, logoUrl: apiAssetUrl(branding.logoUrl) }));
  },
  removerTenantLogo: () =>
    fetchComTimeout(`${BASE}/api/tenant/branding/logo`, { method: "DELETE" }, API_TIMEOUT_MS)
      .then(handle<TenantBranding>)
      .then((branding) => ({ ...branding, logoUrl: apiAssetUrl(branding.logoUrl) })),
  cambio: (moeda = "USD") =>
    fetchComTimeout(`${BASE}/api/cambio?moeda=${moeda}`, {}, API_TIMEOUT_MS).then(handle<Cambio>),

  parse: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetchComTimeout(
      `${BASE}/api/parse`,
      { method: "POST", body: fd },
      PARSE_TIMEOUT_MS,
      { forceRefreshToken: true },
    ).then(
      handle<ParsedSheet>,
    );
  },

  classificar: (
    linhas: ParsedSheet["linhas"],
    opts?: {
      moedaPlanilha?: string | null;
      cambioEurUsd?: number | null;
      cambioEurUsdData?: string | null;
      cambioEurUsdFonte?: string | null;
    },
  ) =>
    fetchComTimeout(
      `${BASE}/api/classificar`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          linhas,
          moedaPlanilha: opts?.moedaPlanilha ?? null,
          cambioEurUsd: opts?.cambioEurUsd ?? null,
          cambioEurUsdData: opts?.cambioEurUsdData ?? null,
          cambioEurUsdFonte: opts?.cambioEurUsdFonte ?? null,
        }),
      },
      CLASSIFY_TIMEOUT_MS,
      { forceRefreshToken: true },
    ).then(
      handle<{
        itens: Item[];
        provider: string;
        cambioEurUsd?: number | null;
        cambioEurUsdData?: string | null;
        cambioEurUsdFonte?: string | null;
      }>,
    ),

  analisar: async (
    linhas: ParsedSheet["linhas"],
    opts?: {
      moedaPlanilha?: string;
      cambioEurUsd?: number | null;
      cambioEurUsdData?: string | null;
      cambioEurUsdFonte?: string | null;
      empresaTradeDefault?: string;
    },
  ): Promise<AnaliseCompleta> => {
    const classificado = await fetchComTimeout(
      `${BASE}/api/classificar`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          linhas,
          moedaPlanilha: opts?.moedaPlanilha ?? null,
          cambioEurUsd: opts?.cambioEurUsd ?? null,
          cambioEurUsdData: opts?.cambioEurUsdData ?? null,
          cambioEurUsdFonte: opts?.cambioEurUsdFonte ?? null,
        }),
      },
      CLASSIFY_TIMEOUT_MS,
      { forceRefreshToken: true },
    ).then(
      handle<{
        itens: Item[];
        provider: string;
        cambioEurUsd?: number | null;
        cambioEurUsdData?: string | null;
        cambioEurUsdFonte?: string | null;
      }>,
    );
    const { itens, provider } = classificado;

    const comFobPlanilha = itens.some((it) => it.fobTotalUS > 0);
    const cambio = await fetchAutenticado(`${BASE}/api/cambio?moeda=USD`, {}, { forceRefreshToken: true }).then(
      handle<Cambio>,
    );
    const benefFiscal = "ALAGOAS";
    const origem = "RJ";
    const destino = "SP";
    const qtdContainers = 1;
    const cotacao = mesclarAvisoMoedaCotacao({
      empresaTrade: opts?.empresaTradeDefault?.trim() || "comexia",
      cliente: "Análise importação",
      benefFiscal,
      moeda: "US$",
      moedaPlanilha: opts?.moedaPlanilha ?? null,
      cambioEurUsd: classificado.cambioEurUsd ?? opts?.cambioEurUsd ?? null,
      cambioEurUsdData: classificado.cambioEurUsdData ?? opts?.cambioEurUsdData ?? null,
      cambioEurUsdFonte: classificado.cambioEurUsdFonte ?? opts?.cambioEurUsdFonte ?? null,
      ufEmpresa: "AL",
      regimeIcms: "AL_DIFERIDO" as const,
      icmsSaidaManualFlag: false,
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
        markupPct: 0.04,
        pisSaida: 0.0165,
        cofinsSaida: 0.076,
        icmsSaida: icmsSaidaParaDestino(destino, benefFiscal),
        csllSobreMarkup: 0.09,
        irrfAliq: 0.25,
        irrfBaseNotaPct: 0.027,
        ipiTetoAliqMedia: 0.15,
        icmsEntrada: 0,
      },
    });
    const calc = await fetchComTimeout(
      `${BASE}/api/calcular`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cotacao),
      },
      CLASSIFY_TIMEOUT_MS,
      { forceRefreshToken: true },
    ).then(
      handle<{
        resultado: ResultadoCotacao;
        itens: Item[];
        icms: IcmsCotacaoMeta;
        avisosFiscais: string[];
        params: Cotacao["params"];
      }>,
    );
    const { resultado, itens: itensCalc, icms, avisosFiscais, params } = calc;
    const fobEngine = resultado.entrada.fobTotalUS;
    const temResultado = fobEngine > 0 && resultado.totalBRL > 0;
    return {
      itens: itensCalc,
      provider,
      icms,
      avisosFiscais,
      resultado: temResultado ? resultado : null,
      avisoFiscal: temResultado
        ? !comFobPlanilha
          ? "FOB estimado via benchmark ComexStat onde a planilha não tinha preço."
          : null
        : "Informe FOB na planilha ou confira peso/NCM para estimativa ComexStat.",
      cotacao: {
        ...cotacao,
        params,
        avisosFiscais,
        icmsSaidaManualFlag: icms.icmsSaidaManualFlag,
        itens: itensCalc,
      },
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
    return fetchAutenticado(`${BASE}/api/dashboard/relatorio?${params}`).then(handle<RelatorioFaturamento>);
  },

  baixarRelatorioFaturamentoPdf: async (ano: number, mes?: number) => {
    const params = new URLSearchParams({ ano: String(ano) });
    if (mes != null) params.set("mes", String(mes));
    const res = await fetchAutenticado(`${BASE}/api/dashboard/relatorio/pdf?${params}`);
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
    fetchAutenticado(`${BASE}/api/cotacoes/${id}/duplicar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts ?? {}),
    }).then(handle<CotacaoSalva>),

  excluirCotacao: (id: string) =>
    fetchAutenticado(`${BASE}/api/cotacoes/${id}`, { method: "DELETE" }).then(handle<{ ok: true }>),

  calcular: (cotacao: Cotacao) =>
    fetchAutenticado(`${BASE}/api/calcular`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cotacao),
    }).then(
      handle<{
        resultado: ResultadoCotacao;
        itens: Item[];
        icms: IcmsCotacaoMeta;
        avisosFiscais: string[];
        params: Cotacao["params"];
      }>,
    ),

  atualizarCotacao: (id: string, opts: Record<string, unknown>) =>
    fetchAutenticado(`${BASE}/api/cotacoes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts),
    }).then(handle<CotacaoSalva>),

  compararRegimesCotacao: (id: string) =>
    fetchAutenticado(`${BASE}/api/cotacoes/${id}/comparar-regimes`, {}).then(
      handle<{
        linhas: Array<{
          regimeDestinoId: string;
          nome: string;
          fonteLegal?: string;
          totalBRL: number;
          icmsEntradaAntecipado: number;
          icmsSaida: number;
          fundosObrigatorios: number;
          economiaVsIntegral?: number;
        }>;
      }>,
    ),

  confirmarNcmItem: (cotacaoId: string, ordem: number, confirmadoPor?: string) =>
    fetchComTimeout(
      `${BASE}/api/cotacoes/${cotacaoId}/itens/${ordem}/confirmar-ncm`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(confirmadoPor ? { confirmadoPor } : {}),
      },
      NCM_ITEM_TIMEOUT_MS,
    ).then(handle<CotacaoSalva>),

  confirmarNcmLote: (cotacaoId: string, confirmadoPor?: string) =>
    fetchComTimeout(
      `${BASE}/api/cotacoes/${cotacaoId}/itens/confirmar-ncm-lote`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(confirmadoPor ? { confirmadoPor } : {}),
      },
      NCM_ITEM_TIMEOUT_MS,
    ).then(handle<CotacaoSalva & { aprovados: number; pulados: number; pendentes: number }>),

  desfazerNcmItem: (cotacaoId: string, ordem: number) =>
    fetchComTimeout(
      `${BASE}/api/cotacoes/${cotacaoId}/itens/${ordem}/desfazer-ncm`,
      { method: "POST" },
      NCM_ITEM_TIMEOUT_MS,
    ).then(handle<CotacaoSalva>),

  alterarNcmItem: (cotacaoId: string, ordem: number, ncm: string) =>
    fetchComTimeout(
      `${BASE}/api/cotacoes/${cotacaoId}/itens/${ordem}/ncm`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ncm }),
      },
      NCM_ITEM_TIMEOUT_MS,
    ).then(handle<CotacaoSalva & { ordem?: number; avisoCoerencia?: string | null; avisoFobKg?: string | null }>),

  alterarFobKgItem: (cotacaoId: string, ordem: number, fobKgManual: number | null) =>
    fetchComTimeout(
      `${BASE}/api/cotacoes/${cotacaoId}/itens/${ordem}/fob-kg`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fobKgManual }),
      },
      NCM_ITEM_TIMEOUT_MS,
    ).then(
      handle<
        CotacaoSalva & {
          ordem: number;
          fobKgFinal: number | null;
          avisoValoracao: AvisoValoracao | null;
        }
      >,
    ),

  alterarCustoUnitarioVeiculoItem: (cotacaoId: string, ordem: number, custoUnitarioUS: number) =>
    fetchComTimeout(
      `${BASE}/api/cotacoes/${cotacaoId}/itens/${ordem}/custo-unitario-veiculo`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ custoUnitarioUS }),
      },
      NCM_ITEM_TIMEOUT_MS,
    ).then(
      handle<
        CotacaoSalva & {
          ordem: number;
          custoUnitarioUS: number;
          fobTotalUS: number;
          avisoCustoVeiculo?: string;
        }
      >,
    ),

  reclassificarCotacao: (cotacaoId: string) =>
    fetchComTimeout(
      `${BASE}/api/cotacoes/${cotacaoId}/reclassificar`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      NCM_ITEM_TIMEOUT_MS,
    ).then(handle<CotacaoSalva>),

  /** Conciliação IA — informativa; sempre HTTP 200. */
  conciliarNcmItem: (cotacaoId: string, ordem: number) =>
    fetchComTimeout(
      `${BASE}/api/cotacoes/${cotacaoId}/itens/${ordem}/conciliar-ncm`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      NCM_ITEM_TIMEOUT_MS,
    ).then(handleJsonAlways<ConciliarNcmResult>),

  lookupNcm: (ncm: string) =>
    fetchComTimeout(
      `${BASE}/api/ncm/lookup`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ncm }),
      },
      API_TIMEOUT_MS,
    ).then(handleJsonAlways<LookupNcmResult>),

  /** @deprecated use atualizarCotacao */
  atualizarFiscal: (id: string, opts: Record<string, unknown>) =>
    fetchAutenticado(`${BASE}/api/cotacoes/${id}/fiscal`, {
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
        itensInvalidos?: ItemInvalidoPdf[];
      };
      let parsed: PdfErroJson | null = null;
      try {
        parsed = JSON.parse(txt) as PdfErroJson;
      } catch (parseErr) {
        void parseErr;
      }
      if (parsed?.erro) {
        throw new PdfDownloadError(parsed.erro, {
          codigo: parsed.codigo,
          itensInvalidos: parsed.itensInvalidos,
        });
      }
      throw new PdfDownloadError(txt || `Falha ao gerar PDF (${res.status})`);
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
    fetchAutenticado(`${BASE}/api/fiscal/ufs?benefFiscal=${encodeURIComponent(benefFiscal)}`).then(
      handle<{
        ufs: { sigla: string; nome: string; icmsInterno: number; icmsEfetivoSaida: number }[];
      }>,
    ),

  listarUsuariosAdmin: () =>
    fetchComTimeout(`${BASE}/api/admin/usuarios`, {}, API_TIMEOUT_MS).then(
      handle<{ usuarios: UsuarioAdmin[]; pendentes: number }>,
    ),

  contarUsuariosPendentes: () =>
    fetchComTimeout(`${BASE}/api/admin/usuarios/pendentes-count`, {}, API_TIMEOUT_MS).then(
      handle<{ pendentes: number }>,
    ),

  listarLoginEventosAdmin: (limite = 20, offset = 0) =>
    fetchComTimeout(
      `${BASE}/api/admin/login-eventos?limite=${limite}&offset=${offset}`,
      {},
      API_TIMEOUT_MS,
    ).then(handle<{ eventos: LoginEventoAdmin[]; total: number }>),

  contarLoginsBloqueadosRecentes: () =>
    fetchComTimeout(`${BASE}/api/admin/login-eventos/bloqueados-count`, {}, API_TIMEOUT_MS).then(
      handle<{ bloqueados24h: number }>,
    ),

  atualizarUsuarioAdmin: (id: string, acao: "aprovar" | "bloquear") =>
    fetchComTimeout(
      `${BASE}/api/admin/usuarios/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      },
      API_TIMEOUT_MS,
    ).then(handle<{ usuario: UsuarioAdmin; pendentes: number }>),
};
