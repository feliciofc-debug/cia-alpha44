/**
 * Parser de planilha de fornecedor (passo 1 do pipeline).
 *
 * Lê .xlsx/.csv em qualquer idioma (PT/EN/中文), detecta a linha de cabeçalho e
 * mapeia colunas (descrição, NCM, qtd, peso, preço, dimensões) por dicionário
 * multi-idioma. Devolve o mapeamento + as linhas cruas para o restante do
 * pipeline (tradução/NCM via LLM, alíquotas, etc.).
 */

import * as XLSX from "xlsx";

export type CampoDetectado =
  | "descricao"
  | "ncm"
  | "qtd"
  | "unidade"
  | "pesoBruto"
  | "pesoLiq"
  | "fobUnit"
  | "fobTotal"
  | "dimensoes";

export interface ColunaDetectada {
  campo: CampoDetectado;
  colIndex: number;
  header: string;
  confianca: number;
}

export interface LinhaCrua {
  __row: number;
  descOriginal: string;
  ncm: string | null;
  qtd: number | null;
  unidade: string | null;
  pesoBrutoKg: number | null;
  pesoLiqKg: number | null;
  fobUnitarioUS: number | null;
  fobTotalUS: number | null;
  dimensoes: string | null;
}

export interface PlanilhaParseada {
  abaUsada: string;
  headerRowIndex: number;
  colunas: ColunaDetectada[];
  mapeamento: Partial<Record<CampoDetectado, number>>;
  linhas: LinhaCrua[];
  totalLinhas: number;
  avisos: string[];
}

/** Sinônimos por campo. Tokens latinos são comparados sem acento/caixa; tokens CJK por substring. */
const SINONIMOS: Record<CampoDetectado, string[]> = {
  descricao: [
    "descricao", "description", "produto", "product", "item", "nome", "name",
    "goods", "commodity", "descricao do produto", "品名", "名称", "描述", "产品名称", "货物名称", "产品",
  ],
  ncm: ["ncm", "hs code", "hscode", "hs", "h.s", "ncm/hs", "hs no", "海关编码", "商品编码", "hs编码"],
  qtd: ["qtd", "quantidade", "qty", "quantity", "q.ty", "pcs", "units", "数量", "件数"],
  unidade: ["unidade", "unit", "uom", "u.m", "单位"],
  pesoBruto: ["peso bruto", "gross weight", "g.w", "gw", "gross", "毛重"],
  pesoLiq: ["peso liquido", "net weight", "n.w", "nw", "net", "净重"],
  fobUnit: ["preco unitario", "unit price", "unitprice", "price/unit", "u.price", "unit fob", "单价"],
  fobTotal: [
    "valor total", "total amount", "total price", "amount", "fob total", "total fob",
    "total value", "fob", "total", "金额", "总价",
  ],
  dimensoes: ["dimensoes", "dimensions", "size", "medidas", "尺寸", "规格", "cbm"],
};

/** Ordem de prioridade quando uma coluna casa com mais de um campo. */
const PRIORIDADE: CampoDetectado[] = [
  "ncm", "pesoLiq", "pesoBruto", "fobUnit", "fobTotal", "qtd", "dimensoes", "unidade", "descricao",
];

function normalize(s: string): string {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function temCJK(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

/** Classifica um header em um campo (ou null), com confiança. */
function classificarHeader(headerRaw: string): { campo: CampoDetectado; confianca: number } | null {
  const norm = normalize(headerRaw);
  if (!norm) return null;
  let melhor: { campo: CampoDetectado; confianca: number; tamanho: number } | null = null;

  for (const campo of PRIORIDADE) {
    for (const syn of SINONIMOS[campo]) {
      const isCJK = temCJK(syn);
      const alvo = isCJK ? headerRaw : norm;
      const token = isCJK ? syn : normalize(syn);
      if (!token) continue;
      let conf = 0;
      if (alvo === token) conf = 1;
      else if (alvo.includes(token)) conf = isCJK ? 0.9 : 0.75;
      if (conf > 0) {
        const cand = { campo, confianca: conf, tamanho: token.length };
        if (!melhor || cand.confianca > melhor.confianca || (cand.confianca === melhor.confianca && cand.tamanho > melhor.tamanho)) {
          melhor = cand;
        }
      }
    }
  }
  return melhor ? { campo: melhor.campo, confianca: melhor.confianca } : null;
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  // Heurística de decimal: se tem ',' e '.', o último separador é o decimal.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Localiza a melhor linha de cabeçalho nas primeiras `maxScan` linhas. */
function acharHeader(rows: unknown[][], maxScan = 20): { idx: number; mapa: Map<number, ColunaDetectada> } {
  let melhorIdx = -1;
  let melhorMapa = new Map<number, ColunaDetectada>();
  let melhorScore = 0;

  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const row = rows[i] ?? [];
    const mapa = new Map<number, ColunaDetectada>();
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell === null || cell === undefined) continue;
      const cls = classificarHeader(String(cell));
      if (cls) mapa.set(c, { campo: cls.campo, colIndex: c, header: String(cell).trim(), confianca: cls.confianca });
    }
    const camposDistintos = new Set(Array.from(mapa.values()).map((m) => m.campo));
    const score = camposDistintos.size + Array.from(mapa.values()).reduce((a, m) => a + m.confianca, 0) * 0.1;
    if (camposDistintos.size >= 2 && score > melhorScore) {
      melhorScore = score;
      melhorIdx = i;
      melhorMapa = mapa;
    }
  }
  return { idx: melhorIdx, mapa: melhorMapa };
}

/** Resolve conflitos: 1 coluna por campo (maior confiança vence). */
function resolverMapeamento(mapa: Map<number, ColunaDetectada>): {
  colunas: ColunaDetectada[];
  mapeamento: Partial<Record<CampoDetectado, number>>;
} {
  const porCampo = new Map<CampoDetectado, ColunaDetectada>();
  for (const col of mapa.values()) {
    const atual = porCampo.get(col.campo);
    if (!atual || col.confianca > atual.confianca) porCampo.set(col.campo, col);
  }
  const colunas = Array.from(porCampo.values()).sort((a, b) => a.colIndex - b.colIndex);
  const mapeamento: Partial<Record<CampoDetectado, number>> = {};
  for (const col of colunas) mapeamento[col.campo] = col.colIndex;
  return { colunas, mapeamento };
}

export interface ParseOptions {
  /** Força o índice da aba a usar. Default: primeira aba não vazia. */
  abaIndex?: number;
}

/** Faz o parse a partir de uma planilha já lida (matriz de linhas). */
export function parseRows(rows: unknown[][], abaNome = "Sheet1"): PlanilhaParseada {
  const avisos: string[] = [];
  const { idx: headerRowIndex, mapa } = acharHeader(rows);

  if (headerRowIndex < 0) {
    return {
      abaUsada: abaNome,
      headerRowIndex: -1,
      colunas: [],
      mapeamento: {},
      linhas: [],
      totalLinhas: 0,
      avisos: ["Não foi possível detectar o cabeçalho automaticamente — mapeamento manual necessário."],
    };
  }

  const { colunas, mapeamento } = resolverMapeamento(mapa);
  if (mapeamento.descricao === undefined) avisos.push("Coluna de DESCRIÇÃO não detectada.");
  if (mapeamento.pesoLiq === undefined && mapeamento.pesoBruto === undefined) {
    avisos.push("Nenhuma coluna de PESO detectada (líquido ou bruto).");
  }
  if (mapeamento.fobTotal === undefined && mapeamento.fobUnit === undefined) {
    avisos.push("Nenhuma coluna de PREÇO/FOB detectada.");
  }

  const linhas: LinhaCrua[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const get = (campo: CampoDetectado): unknown => {
      const c = mapeamento[campo];
      return c === undefined ? null : row[c] ?? null;
    };
    const desc = String(get("descricao") ?? "").trim();
    const qtd = parseNum(get("qtd"));
    const pesoBruto = parseNum(get("pesoBruto"));
    const pesoLiq = parseNum(get("pesoLiq"));
    const fobUnit = parseNum(get("fobUnit"));
    let fobTotal = parseNum(get("fobTotal"));
    const ncmRaw = String(get("ncm") ?? "").replace(/\D/g, "");

    // linha vazia → ignora
    if (!desc && qtd === null && pesoBruto === null && pesoLiq === null && fobUnit === null && fobTotal === null) {
      continue;
    }
    // deriva FOB total de unit * qtd quando faltar
    if (fobTotal === null && fobUnit !== null && qtd !== null) fobTotal = fobUnit * qtd;

    linhas.push({
      __row: i,
      descOriginal: desc,
      ncm: ncmRaw.length === 8 ? ncmRaw : null,
      qtd,
      unidade: (String(get("unidade") ?? "").trim() || null),
      pesoBrutoKg: pesoBruto,
      pesoLiqKg: pesoLiq,
      fobUnitarioUS: fobUnit,
      fobTotalUS: fobTotal,
      dimensoes: (String(get("dimensoes") ?? "").trim() || null),
    });
  }

  return {
    abaUsada: abaNome,
    headerRowIndex,
    colunas,
    mapeamento,
    linhas,
    totalLinhas: linhas.length,
    avisos,
  };
}

/** Faz o parse a partir do conteúdo binário do arquivo (.xlsx/.csv). */
export function parseSupplierFile(data: ArrayBuffer | Uint8Array, opts: ParseOptions = {}): PlanilhaParseada {
  const wb = XLSX.read(data, { type: "array" });
  let abaIndex = opts.abaIndex ?? -1;
  if (abaIndex < 0) {
    // primeira aba com mais de uma linha
    abaIndex = wb.SheetNames.findIndex((n) => {
      const ws = wb.Sheets[n];
      return ws && ws["!ref"] && XLSX.utils.decode_range(ws["!ref"]).e.r > 0;
    });
    if (abaIndex < 0) abaIndex = 0;
  }
  const nome = wb.SheetNames[abaIndex] ?? "Sheet1";
  const ws = wb.Sheets[nome];
  if (!ws) {
    return { abaUsada: nome, headerRowIndex: -1, colunas: [], mapeamento: {}, linhas: [], totalLinhas: 0, avisos: ["Aba vazia."] };
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  return parseRows(rows, nome);
}

/** Peso líquido com fallback peso_bruto * 0.92 (regra 4). */
export function resolvePesoLiqLinha(l: LinhaCrua): number {
  if (l.pesoLiqKg && l.pesoLiqKg > 0) return l.pesoLiqKg;
  if (l.pesoBrutoKg && l.pesoBrutoKg > 0) return l.pesoBrutoKg * 0.92;
  return 0;
}
