/** Camada (b): overlap de termos produto × descrição NCM Siscomex. */

export type StatusHeuristica = "compativel" | "incompativel" | "revisar" | "inconclusivo";

export interface ResultadoHeuristica {
  status: StatusHeuristica;
  /** Coeficiente Jaccard 0–1 entre tokens do produto e da descrição NCM. */
  score: number;
  motivo: string;
}

const STOP = new Set([
  "para",
  "com",
  "sem",
  "outros",
  "outras",
  "demais",
  "exceto",
  "nas",
  "nos",
  "das",
  "dos",
  "que",
  "por",
  "the",
  "and",
  "with",
  "from",
  "de",
  "da",
  "do",
  "em",
  "ou",
  "nao",
  "artigos",
  "partes",
  "acessorios",
  "preparacoes",
  "preparacao",
  "produtos",
  "aparelhos",
  "materias",
  "obras",
  "usados",
  "uso",
  "domestico",
  "domesticos",
  "industrial",
  "geral",
  "especial",
  "inclusive",
  "mesmo",
  "mesma",
  "tipo",
  "tipos",
  "classificados",
  "classificadas",
  "posicao",
  "subposicao",
  "capitulo",
  "secao",
  // Stopwords PT de descrições NCM genéricas (evitam falso overlap capítulo errado)
  "leite",
  "farinha",
  "lact",
  "lactea",
  "lacteas",
  "cereal",
  "cereais",
  "aliment",
  "alimentos",
  "alimenticia",
  "alimenticias",
  "comest",
  "comestivel",
  "comestiveis",
  "infantil",
  "infantis",
  "formula",
  "formulas",
  "composto",
  "compostos",
  "extrato",
  "extratos",
  "nutric",
  "contendo",
  "obtidos",
  "obtido",
  "obtida",
  "obtidas",
  "similares",
  "similar",
  "diversos",
  "diversas",
  "incluindo",
  "inclui",
  "num",
  "numa",
  "sua",
  "seu",
  "seus",
  "suas",
  "mais",
  "menos",
  "sob",
  "sobre",
  "entre",
  "forma",
  "formas",
  "onde",
  "quando",
  "qual",
  "quais",
  "este",
  "esta",
  "estes",
  "estas",
  "aquele",
  "aquela",
  "veiculos",
  "veiculo",
  "automoveis",
  "automotivo",
  "automotivos",
]);

/** Overlap alto — rebaixa indício de família para revisar (falso positivo regex). */
export const OVERLAP_ALTO = 0.18;
/** Overlap baixo — indício forte de incompatibilidade semântica. */
export const OVERLAP_BAIXO = 0.06;
/** Overlap mínimo para sinal compatível. */
export const OVERLAP_OK = 0.11;

function tokenize(texto: string): Set<string> {
  const norm = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const tokens = norm.split(/[^a-z0-9\u4e00-\u9fff]+/).filter((t) => t.length >= 3 && !STOP.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  const uni = a.size + b.size - inter;
  return uni > 0 ? inter / uni : 0;
}

/** Tokens do produto presentes na descrição NCM (inclui stem simples para plural). */
function overlapSubstrings(tokensProduto: Set<string>, ncmTextoNorm: string): number {
  if (!tokensProduto.size) return 0;
  let hits = 0;
  for (const t of tokensProduto) {
    const raiz = t.length > 4 ? t.slice(0, Math.max(4, t.length - 1)) : t;
    if (ncmTextoNorm.includes(t) || ncmTextoNorm.includes(raiz)) hits++;
  }
  return hits / tokensProduto.size;
}

function paresFortes(produto: string, ncmTexto: string): string | null {
  const pares: Array<{ produto: RegExp; ncm: RegExp; label: string }> = [
    {
      produto: /lustre|lumin[aá]ria|chandelier|pendente|plafon/i,
      ncm: /lustre|lumin[aá]ria|iluminac|chandelier|aparelhos de iluminac/i,
      label: "iluminação",
    },
    {
      produto: /parafus|porca\b|sexav|bolt|screw/i,
      ncm: /parafus|porca|tornillo|screw|bolt|fixador|rosca/i,
      label: "fixadores",
    },
    {
      produto: /cadeira|chair|assento|estofad/i,
      ncm: /assento|cadeira|seat|estofad|mobiliario/i,
      label: "assentos/móveis",
    },
  ];
  for (const par of pares) {
    if (par.produto.test(produto) && par.ncm.test(ncmTexto)) return par.label;
  }
  return null;
}

/** Palavras de domínios distantes — par mínimo indica antagonismo. */
const DOMINIOS: Record<string, RegExp> = {
  alimento: /farinha|lact|leite|aliment|comest|food|grain|flour|milk|preparac/i,
  metalurgia: /parafus|porca|sexav|bolt|screw|ferro|aco|metal|fixador|rosca|铁|钢|stainless|inox/i,
  imunologico: /imunolog|vacina|soro|anticorpo|hemoglobin|plasma|preparac.*imun/i,
  moveis: /cadeira|chair|assento|seat|estofad|upholster|altura\s*ajust|swivel|girator/i,
  iluminacao: /lustre|lumin|chandelier|pendente|plafon|light\s*fixture|led\s*panel/i,
  eletronico: /fone|headphone|bluetooth|celular|smartphone|camera|cabo\s*eletr/i,
};

function dominiosAtivos(texto: string): string[] {
  return Object.entries(DOMINIOS)
    .filter(([, re]) => re.test(texto))
    .map(([k]) => k);
}

function antagonismo(produto: string, ncmTexto: string): string | null {
  const dp = dominiosAtivos(produto);
  const dn = dominiosAtivos(ncmTexto);
  if (!dp.length || !dn.length) return null;
  const conjunto = new Set([...dp, ...dn]);
  if (conjunto.size >= 2 && dp.some((d) => !dn.includes(d))) {
    return `${dp.join("/")} × ${dn.join("/")}`;
  }
  return null;
}

/** Subposição suspeita: atributos do produto não batem com faixa NCM-8. */
function suspeitaSubposicao(descProduto: string, ncm: string): string | null {
  const key = ncm.replace(/\D/g, "").padStart(8, "0");
  const estofada = /estofad|upholster|estofo|foam/i.test(descProduto);
  const alturaAjust = /altura\s*ajust|height\s*adjust|adjustable\s*height/i.test(descProduto);
  if (estofada && alturaAjust && /^94017/.test(key)) {
    return "produto estofado de altura ajustável vs subposição de assentos metálicos (9401.7x)";
  }
  if (estofada && /^94017/.test(key)) {
    return "produto estofado vs NCM de assentos metálicos (9401.7x)";
  }
  return null;
}

export function avaliarHeuristicaTermos(
  descricaoProduto: string,
  descricaoNcmCompleta: string | null | undefined,
  termosFamilia?: string,
  ncm?: string,
): ResultadoHeuristica {
  const produto = descricaoProduto.trim();
  const ncmTexto = (descricaoNcmCompleta ?? "").trim();
  const ncmKey = (ncm ?? "").replace(/\D/g, "").padStart(8, "0");

  if (!produto) {
    return { status: "inconclusivo", score: 0, motivo: "Descrição do produto ausente." };
  }
  if (!ncmTexto) {
    return { status: "inconclusivo", score: 0, motivo: "Descrição NCM Siscomex indisponível." };
  }

  const tokensProduto = tokenize(`${produto} ${termosFamilia ?? ""}`);
  const tokensNcm = tokenize(ncmTexto);
  const ncmNorm = ncmTexto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const scoreJaccard = jaccard(tokensProduto, tokensNcm);
  const scoreSub = overlapSubstrings(tokensProduto, ncmNorm);
  const score = Math.max(scoreJaccard, scoreSub * 0.85);

  const sub = ncmKey.length === 8 ? suspeitaSubposicao(produto, ncmKey) : null;
  if (sub) {
    return { status: "revisar", score, motivo: sub };
  }

  const forte = paresFortes(produto, ncmTexto);
  if (forte) {
    return {
      status: "compativel",
      score: Math.max(score, OVERLAP_OK),
      motivo: `Termos de ${forte} alinhados entre produto e descrição NCM.`,
    };
  }

  const antag = antagonismo(produto, ncmTexto);
  if (antag && score < OVERLAP_ALTO) {
    return {
      status: "incompativel",
      score,
      motivo: `Domínios distantes (${antag}) com baixo overlap de termos (${(score * 100).toFixed(0)}%).`,
    };
  }

  if (score >= OVERLAP_OK) {
    return {
      status: "compativel",
      score,
      motivo: `Overlap de termos com descrição NCM (${(score * 100).toFixed(0)}%).`,
    };
  }

  if (score < OVERLAP_BAIXO) {
    return {
      status: "incompativel",
      score,
      motivo: `Quase nenhum termo em comum com descrição NCM (${(score * 100).toFixed(0)}%).`,
    };
  }

  return {
    status: "revisar",
    score,
    motivo: `Overlap parcial com descrição NCM (${(score * 100).toFixed(0)}%) — confirmar subposição.`,
  };
}
