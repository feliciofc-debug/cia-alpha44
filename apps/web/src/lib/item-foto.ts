import { useEffect, useState } from "react";
import { fetchAutenticado } from "./auth-fetch.ts";
import type { Item } from "./types.ts";

const API_BASE = (import.meta.env.VITE_API_URL as string) || "";

export function fotoItemSrc(it: Item): string | null {
  if (it.fotoBase64) return `data:${it.fotoMime ?? "image/jpeg"};base64,${it.fotoBase64}`;
  if (it.fotoUrl) return `${API_BASE}${it.fotoUrl}`;
  return null;
}

export function itemTemFoto(it: Item): boolean {
  return Boolean(it.fotoBase64 || it.fotoUrl);
}

export function useFotoItemSrc(it: Item): string | null {
  const inline = it.fotoBase64 ? `data:${it.fotoMime ?? "image/jpeg"};base64,${it.fotoBase64}` : null;
  const url = !inline && it.fotoUrl ? `${API_BASE}${it.fotoUrl}` : null;
  const [blobSrc, setBlobSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setBlobSrc(null);
      return;
    }

    let ativo = true;
    let objectUrl: string | null = null;

    fetchAutenticado(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Foto HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!ativo) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobSrc(objectUrl);
      })
      .catch(() => {
        if (ativo) setBlobSrc(null);
      });

    return () => {
      ativo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return inline ?? blobSrc;
}

export function contarItensComFoto(itens: Item[]): number {
  return itens.filter(itemTemFoto).length;
}
