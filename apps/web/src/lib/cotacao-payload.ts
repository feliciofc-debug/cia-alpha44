import type { Cotacao, Item } from "./types.ts";

/** Remove fotos duplicadas de cotacao.itens — ficam só no array itens do POST. */
export function cotacaoParaSalvar(cotacao: Cotacao): Cotacao {
  return {
    ...cotacao,
    itens: cotacao.itens.map(({ fotoBase64: _b, fotoRef: _r, fotoMime: _m, fotoPath: _p, fotoUrl: _u, ...it }) => it),
  };
}

export function itensParaSalvar(itens: Item[]): Item[] {
  return itens.map(({ fotoUrl: _u, ...it }) => it);
}

/** Exportação de conciliação não usa imagens; evita payloads grandes ou referências temporárias. */
export function itensSemFotos(itens: Item[]): Item[] {
  return itens.map(
    ({ fotoBase64: _b, fotoRef: _r, fotoMime: _m, fotoPath: _p, fotoUrl: _u, ...it }) => it as Item,
  );
}
