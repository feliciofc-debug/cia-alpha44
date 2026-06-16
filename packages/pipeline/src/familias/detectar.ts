import { FAMILIAS_PRODUTO, RE_SIDERURGICO_PLANO } from "./catalogo.js";
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

const IDS_FILTROS = "filtros_separadores";
const IDS_AUTO_8708 = new Set(["autopecas", "pecas_veiculo_leve"]);
const IDS_ALIMENTOS = "alimentos_bebidas";
const IDS_EMBALAGEM = "embalagem_papel";

/** Famílias de material/composição — cedem a produto funcional na mesma descrição. */
const IDS_MATERIAL = new Set(["aluminio", "metal_ferro_aco", "plasticos_chapas", "plastico_utilidades"]);

/** Produto funcional explícito — prevalece sobre material (não afeta veículo+metal explícito). */
const IDS_PRECEDE_MATERIAL = new Set([
  "bombas_ar",
  "bombas_liquido",
  "ferramentas_eletricas",
  "ferramentas_manual",
  "ferramentas_maquina",
  "sensores_instrumentos",
  "cozinha_utensilios",
  "siderurgico_plano",
  "brinquedos",
  "moto_eletrica",
  "veiculo_leve_eletrico",
  IDS_FILTROS,
  IDS_ALIMENTOS,
]);

/** Ferramentas e bombas — precedem brinquedos/bicicleta quando o texto descreve o produto. */
const IDS_FERRAMENTAS = new Set(["ferramentas_eletricas", "ferramentas_manual", "ferramentas_maquina"]);
const IDS_BOMBA_AR = "bombas_ar";

function normalizarInput(input: string | DetectarFamiliasInput): DetectarFamiliasInput {
  if (typeof input === "string") return { descOriginal: input };
  return input;
}

/** descOriginal (fonte) + descPt (reforço) — família não depende só da tradução instável. */
export function textoDeteccaoFamilia(descOriginal: string, descPt?: string | null): string {
  const orig = descOriginal.trim();
  const pt = descPt?.trim();
  if (!pt || pt === orig) return orig;
  return `${orig} ${pt}`;
}

function matchFamilia(descricao: string, familia: FamiliaProduto): string | null {
  const m = descricao.match(familia.re);
  if (!m) return null;

  if (familia.id === "brinquedos" && RE_ELETRICO.test(descricao)) {
    return null;
  }
  if (familia.id === "metal_ferro_aco" && RE_SIDERURGICO_PLANO.test(descricao)) {
    return null;
  }
  if (
    familia.id === "alimentos_bebidas" &&
    /\bfiltro\b/i.test(descricao) &&
    /caf[eé]|coffee|ch[aá]\b|tea\b|\bar\b|oleo|óleo|oil/i.test(descricao)
  ) {
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

/**
 * Produto funcional prevalece sobre material (bomba alumínio → bombas_ar, não 7615).
 * Ferramentas prevalecem sobre brinquedos ("jogo de chaves" → 8204/8205, não 9503).
 */
function aplicarPrecedenciaFuncional(familias: FamiliaDetectada[]): FamiliaDetectada[] {
  if (familias.length <= 1) return familias;

  let out = familias;
  const ids = new Set(out.map((f) => f.familia.id));
  const temPrecedencia = out.some((f) => IDS_PRECEDE_MATERIAL.has(f.familia.id));
  const temMaterial = out.some((f) => IDS_MATERIAL.has(f.familia.id));

  if (temPrecedencia && temMaterial) {
    out = out.filter((f) => !IDS_MATERIAL.has(f.familia.id));
  }

  if (out.some((f) => IDS_FERRAMENTAS.has(f.familia.id)) && out.some((f) => f.familia.id === "brinquedos")) {
    out = out.filter((f) => f.familia.id !== "brinquedos");
  }

  if (ids.has(IDS_BOMBA_AR) && out.some((f) => f.familia.id === IDS_BOMBA_AR)) {
    out = out.filter((f) => f.familia.id !== "bicicleta");
  }

  if (out.some((f) => f.familia.id === IDS_FILTROS) && out.some((f) => IDS_AUTO_8708.has(f.familia.id))) {
    out = out.filter((f) => !IDS_AUTO_8708.has(f.familia.id));
  }

  if (out.some((f) => f.familia.id === IDS_ALIMENTOS) && out.some((f) => f.familia.id === IDS_EMBALAGEM)) {
    out = out.filter((f) => f.familia.id !== IDS_EMBALAGEM);
  }

  return out;
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
  familias = aplicarPrecedenciaFuncional(familias);

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
