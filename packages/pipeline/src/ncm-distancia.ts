/** Distância entre NCMs — quanto menor, mais próximo (8→6→4→2 dígitos). */

export const DISTANCIA_MAX_NCM_PROXIMO = 4;

export function distanciaNcm(a: string, b: string): number {
  if (a === b) return 0;
  for (const len of [8, 6, 4, 2] as const) {
    if (a.slice(0, len) === b.slice(0, len)) return 8 - len;
  }
  return 9;
}

export function ncmMaisProximoNoMap<T extends { ncm: string }>(
  ncmAlvo: string,
  map: Map<string, T>,
  maxDist = DISTANCIA_MAX_NCM_PROXIMO,
): { entry: T; dist: number } | null {
  const alvo = ncmAlvo.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
  if (!alvo || alvo === "00000000" || map.size === 0) return null;

  const exato = map.get(alvo);
  if (exato) return { entry: exato, dist: 0 };

  let best: T | null = null;
  let bestDist = Infinity;
  for (const entry of map.values()) {
    const key = entry.ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
    const d = distanciaNcm(alvo, key);
    if (d < bestDist && d <= maxDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best ? { entry: best, dist: bestDist } : null;
}
