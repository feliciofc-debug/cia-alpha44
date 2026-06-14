export type { FamiliaProduto, FamiliaDetectada, ResultadoDeteccaoFamilias } from "./tipos.js";
export { FAMILIAS_PRODUTO } from "./catalogo.js";
export {
  detectarFamilia,
  detectarFamilias,
  avisoConflitoFamilias,
  textoDeteccaoFamilia,
  type DetectarFamiliasInput,
} from "./detectar.js";
export {
  ncmCoerenteComPrefixo,
  ncmCoerenteComFamilia,
  prefixosDasFamilias,
  prefixoBuscaPrincipal,
} from "./coerencia.js";
