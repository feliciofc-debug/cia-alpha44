import { useEffect, useState } from "react";
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
  const dataUrl = fotoItemSrc(item);
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
