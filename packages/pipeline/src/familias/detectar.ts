import { FAMILIAS_PRODUTO } from "./catalogo.js";
import type { FamiliaDetectada, FamiliaProduto, ResultadoDeteccaoFamilias } from "./tipos.js";

const RE_ELETRICO = /el[eé]tr|electric|e-?scooter|hoverboard|电动|滑板车/i;

function matchFamilia(descricao: string, familia: FamiliaProduto): string | null {
  const m = descricao.match(familia.re);
  if (!m) return null;

  if (familia.id === "brinquedos" && RE_ELETRICO.test(descricao)) {
    return null;
  }
  return m[0] ?? "";
}

/** Todas as famílias que casam com a descrição. */
export function detectarFamilias(descricao: string): ResultadoDeteccaoFamilias {
  const d = descricao.trim();
  const familias: FamiliaDetectada[] = [];

  if (d) {
    for (const familia of FAMILIAS_PRODUTO) {
      const match = matchFamilia(d, familia);
      if (match != null) familias.push({ familia, match });
    }
  }

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
export function detectarFamilia(descricao: string): FamiliaProduto | null {
  const { familias, conflito } = detectarFamilias(descricao);
  if (familias.length === 1) return familias[0]!.familia;
  if (conflito) return null;
  return null;
}

export function avisoConflitoFamilias(resultado: ResultadoDeteccaoFamilias): string | undefined {
  return resultado.avisoConflito;
}
