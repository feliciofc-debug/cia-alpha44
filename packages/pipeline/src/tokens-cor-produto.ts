/**
 * Tokens de cor/acabamento — NÃO entram na busca NCM planilha China.
 * Família e tipo de produto prevalecem sobre cor (ex.: "Pipoqueira Preta" ≠ tinta preta).
 */

/** Cores PT/EN e termos cosméticos que geram falso positivo (ex. tinta preta). */
export const TOKENS_COR_PRODUTO = new Set([
  "preta",
  "preto",
  "pretas",
  "pretos",
  "branca",
  "branco",
  "brancas",
  "brancos",
  "azul",
  "azuis",
  "vermelha",
  "vermelho",
  "vermelhas",
  "vermelhos",
  "verde",
  "verdes",
  "amarela",
  "amarelo",
  "amarelas",
  "amarelos",
  "rosa",
  "rosas",
  "cinza",
  "cinzas",
  "grey",
  "gray",
  "black",
  "white",
  "red",
  "blue",
  "green",
  "yellow",
  "pink",
  "silver",
  "gold",
  "dourada",
  "dourado",
  "prata",
  "marrom",
  "bege",
  "color",
  "colour",
  "colored",
  "colourful",
  "黑",
  "白",
  "红",
  "蓝",
  "绿",
  "黄",
  "色",
]);

/** Códigos HY-XXXX do fornecedor — não classificam por si. */
const RE_CODIGO_FORNECEDOR = /^hy[\d-]+$/i;

export function tokenCorOuAcabamento(token: string): boolean {
  return TOKENS_COR_PRODUTO.has(token.toLowerCase());
}

/** Tokens úteis para match semântico (sem cor, sem código HY). */
export function tokensProdutoSemCor(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((t) => t.length >= 3 && !tokenCorOuAcabamento(t) && !RE_CODIGO_FORNECEDOR.test(t));
}
