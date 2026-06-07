import type { Item } from "./types.ts";

const API_BASE = (import.meta.env.VITE_API_URL as string) || "";

export function fotoItemSrc(it: Item): string | null {
  if (it.fotoBase64) return `data:${it.fotoMime ?? "image/jpeg"};base64,${it.fotoBase64}`;
  if (it.fotoUrl) return `${API_BASE}${it.fotoUrl}`;
  return null;
}

export function contarItensComFoto(itens: Item[]): number {
  return itens.filter((it) => it.fotoBase64 || it.fotoUrl).length;
}
