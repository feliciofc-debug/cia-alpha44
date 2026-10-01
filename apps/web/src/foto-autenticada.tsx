import { useEffect, useState, type ReactEventHandler } from "react";
import type { Item } from "./lib/types.ts";
import { fetchAutenticado } from "./lib/auth-fetch.ts";
import { fotoItemSrc, fotoItemUrlAutenticada } from "./lib/item-foto.ts";

export function FotoAutenticada({
  item,
  alt,
  className,
}: {
  item: Item;
  alt: string;
  className: string;
}) {
  const dataUrl = item.fotoBase64 ? fotoItemSrc(item) : null;
  const protegida = fotoItemUrlAutenticada(item);
  const [src, setSrc] = useState<string | null>(dataUrl);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    setFalhou(false);
    if (dataUrl) {
      setSrc(dataUrl);
      return;
    }
    if (!protegida) {
      setSrc(null);
      return;
    }

    let ativa = true;
    let objectUrl: string | null = null;
    setSrc(null);
    void fetchAutenticado(protegida)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Foto HTTP ${res.status}`);
        const blob = await res.blob();
        if (!ativa) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (ativa) setFalhou(true);
      });

    return () => {
      ativa = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [dataUrl, protegida]);

  if (falhou) return null;
  return <img src={src ?? undefined} alt={alt} className={className} onError={() => setFalhou(true)} />;
}

export function FotoItemPorFeature({
  item,
  upgradeUpload,
  alt,
  className,
  onError,
}: {
  item: Item;
  upgradeUpload: boolean;
  alt: string;
  className: string;
  onError?: ReactEventHandler<HTMLImageElement>;
}) {
  if (upgradeUpload) {
    return <FotoAutenticada item={item} alt={alt} className={className} />;
  }
  const src = fotoItemSrc(item);
  if (!src) return null;
  return <img src={src} alt={alt} className={className} onError={onError} />;
}
