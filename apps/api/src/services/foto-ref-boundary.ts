/** Adapta fotoRef no limite HTTP sem alterar os serviços internos legados. */

import { lerFotoParse, validarFotoParse } from "./parse-fotos.js";

export type ComFotoTemporaria = {
  descOriginal?: string;
  fotoBase64?: string;
  fotoRef?: string;
  fotoMime?: string;
};

export class FotoRefNaoEncontradaError extends Error {}

export async function hidratarFotosRef<T extends ComFotoTemporaria>(
  itens: T[],
  tenantId: string,
  carregarBytes: boolean,
): Promise<T[]> {
  return Promise.all(
    itens.map(async (item) => {
      if (!item.fotoRef) return item;
      if (!carregarBytes) {
        if (!(await validarFotoParse(tenantId, item.fotoRef))) {
          throw new FotoRefNaoEncontradaError("Foto temporária não encontrada ou expirada.");
        }
        return item;
      }
      const foto = await lerFotoParse(tenantId, item.fotoRef);
      if (!foto) throw new FotoRefNaoEncontradaError("Foto temporária não encontrada ou expirada.");
      return {
        ...item,
        fotoBase64: foto.buffer.toString("base64"),
        fotoMime: foto.mime,
      };
    }),
  );
}

export function restaurarRefsNaResposta<T extends ComFotoTemporaria, U extends ComFotoTemporaria>(
  entrada: T[],
  saida: U[],
): U[] {
  if (entrada.length !== saida.length) {
    throw new Error("Classificação alterou a cardinalidade das linhas; não foi possível preservar fotoRef.");
  }
  return saida.map((item, idx) => {
    const original = entrada[idx]!;
    if (original.descOriginal != null && item.descOriginal !== original.descOriginal) {
      throw new Error(`Classificação alterou a ordem das linhas no índice ${idx}; fotoRef não foi remapeada.`);
    }
    if (!original.fotoRef) return item;
    return {
      ...item,
      fotoRef: original.fotoRef,
      fotoMime: original.fotoMime ?? item.fotoMime,
      fotoBase64: undefined,
    };
  });
}
