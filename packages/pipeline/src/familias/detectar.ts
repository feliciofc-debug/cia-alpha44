import { FAMILIAS_PRODUTO } from "./catalogo.js";
import type { FamiliaDetectada, FamiliaProduto, ResultadoDeteccaoFamilias } from "./tipos.js";

const RE_ELETRICO = /el[eé]tr|electric|e-?scooter|hoverboard|电动|滑板车/i;

/** Entrada de detecção — material NUNCA entra aqui (só prompt IA / T5). */
export interface DetectarFamiliasInput {
  descOriginal: string;
  uso?: string | null;
}

const RE_USO_PECA = /配件|acess[oó]rio|accessories|spare\s*part|pe[cç]as?\b/i;
const RE_USO_PRODUTO = /骑行|riding|cycling|mobility|transporte|uso\s*final|最终用途/i;

const IDS_PRODUTO_COMPLETO = new Set([
  "veiculo_leve_eletrico",
  "moto_eletrica",
  "bicicleta",
  "brinquedos",
]);
const IDS_PECA = new Set(["pecas_veiculo_leve", "parafusos_fixadores", "autopecas"]);

function normalizarInput(input: string | DetectarFamiliasInput): DetectarFamiliasInput {
  if (typeof input === "string") return { descOriginal: input };
  return input;
}

function matchFamilia(descricao: string, familia: FamiliaProduto): string | null {
  const m = descricao.match(familia.re);
  if (!m) return null;

  if (familia.id === "brinquedos" && RE_ELETRICO.test(descricao)) {
    return null;
  }
  return m[0] ?? "";
}

/** Viés por coluna uso (用途): produto completo vs peça/acessório. */
function aplicarViesUso(familias: FamiliaDetectada[], uso?: string | null): FamiliaDetectada[] {
  const u = (uso ?? "").trim();
  if (!u) return familias;

  if (RE_USO_PRODUTO.test(u)) {
    return familias.filter(
      (f) => !IDS_PECA.has(f.familia.id) && f.familia.id !== "metal_ferro_aco",
    );
  }

  if (RE_USO_PECA.test(u)) {
    let out = familias.filter((f) => !IDS_PRODUTO_COMPLETO.has(f.familia.id));
    if (!out.some((f) => IDS_PECA.has(f.familia.id))) {
      const pecas = FAMILIAS_PRODUTO.find((f) => f.id === "pecas_veiculo_leve");
      if (pecas) out = [...out, { familia: pecas, match: u }];
    }
    return out;
  }

  return familias;
}

/** Todas as famílias que casam com descOriginal (+ viés uso). Material não participa. */
export function detectarFamilias(input: string | DetectarFamiliasInput): ResultadoDeteccaoFamilias {
  const { descOriginal, uso } = normalizarInput(input);
  const d = descOriginal.trim();
  let familias: FamiliaDetectada[] = [];

  if (d) {
    for (const familia of FAMILIAS_PRODUTO) {
      const match = matchFamilia(d, familia);
      if (match != null) familias.push({ familia, match });
    }
  }

  familias = aplicarViesUso(familias, uso);

  const conflito = familias.length > 1;
  const avisoConflito = conflito
    ? `Famílias conflitantes: ${familias.map((f) => f.familia.id).join(", ")} — passe 1 decide capítulo.`
    : undefined;

  return { familias, conflito, avisoConflito };
}

/**
 * Família única ou null (null se zero ou conflito 2+).
 * Guard-rail conservador: conflito não trava, mas não impõe capítulo único.
 */
export function detectarFamilia(input: string | DetectarFamiliasInput): FamiliaProduto | null {
  const { familias, conflito } = detectarFamilias(input);
  if (familias.length === 1) return familias[0]!.familia;
  if (conflito) return null;
  return null;
}

export function avisoConflitoFamilias(resultado: ResultadoDeteccaoFamilias): string | undefined {
  return resultado.avisoConflito;
}
