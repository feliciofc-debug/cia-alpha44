import type { Cotacao, Item, ParsedSheet, ResultadoCotacao } from "./types";

const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:3333";

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
    return fetch(`${BASE}/api/parse`, { method: "POST", body: fd }).then(handle<ParsedSheet>);
  },

  classificar: (linhas: ParsedSheet["linhas"]) =>
    fetch(`${BASE}/api/classificar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ linhas }),
    }).then(handle<{ itens: Item[]; provider: string }>),

  calcular: (cotacao: Cotacao) =>
    fetch(`${BASE}/api/calcular`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cotacao),
    }).then(handle<{ resultado: ResultadoCotacao; itens: Item[] }>),
};
