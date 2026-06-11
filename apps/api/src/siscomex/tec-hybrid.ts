/** Fonte de alíquotas híbrida: TTCE ao vivo (Siscomex) + cache TEC local. */

import { mesclarRastrosTtce, PIS_COFINS_FONTE_PADRAO } from "@cia/shared";
import type { AliquotaResult, AliquotaSource } from "@cia/pipeline";
import type { SiscomexProvider } from "./types.js";

const memCache = new Map<string, { result: AliquotaResult; em: number }>();
const TTL_MS = 6 * 60 * 60_000;

export function criarTecSourceHibrido(base: AliquotaSource, siscomex: SiscomexProvider): AliquotaSource {
  return {
    buscar(ncm: string): AliquotaResult {
      return base.buscar(ncm);
    },
    async buscarAsync(ncm: string): Promise<AliquotaResult> {
      const key = ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
      const cached = memCache.get(key);
      if (cached && Date.now() - cached.em < TTL_MS) return cached.result;

      const fallback = base.buscar(key);
      const consultadoEm = new Date().toISOString();

      if (!siscomex.operacional) return fallback;

      try {
        const ttce = await siscomex.consultarTratamentoTributario(key);
        if (ttce.fonte !== "portal-unico-ttce") return fallback;

        const ii = ttce.aliquotaII ?? fallback.aliquotas.ii;
        const ipi = ttce.aliquotaIPI ?? fallback.aliquotas.ipi;
        const pis = ttce.aliquotaPIS ?? fallback.aliquotas.pis;
        const cofins = ttce.aliquotaCOFINS ?? fallback.aliquotas.cofins;

        const live =
          ttce.aliquotaII != null ||
          ttce.aliquotaIPI != null ||
          (fallback.encontrado === false && (ii > 0 || ipi > 0));

        const liveRastros: Parameters<typeof mesclarRastrosTtce>[1] = {};
        if (ttce.aliquotaII != null) {
          liveRastros.ii = { valor: ii, fonte: "Portal Único TTCE — II" };
        }
        if (ttce.aliquotaIPI != null) {
          liveRastros.ipi = { valor: ipi, fonte: "Portal Único TTCE — IPI" };
        }
        if (ttce.aliquotaPIS != null) {
          liveRastros.pis = { valor: pis, fonte: PIS_COFINS_FONTE_PADRAO };
        }
        if (ttce.aliquotaCOFINS != null) {
          liveRastros.cofins = { valor: cofins, fonte: PIS_COFINS_FONTE_PADRAO };
        }

        const result: AliquotaResult = {
          encontrado: live || fallback.encontrado,
          fonte: live ? "Portal Único TTCE (ao vivo)" : fallback.fonte,
          aliquotas: {
            ii,
            ipi,
            pis,
            cofins,
            icmsEntrada: 0,
          },
          rastros:
            Object.keys(liveRastros).length > 0
              ? mesclarRastrosTtce(fallback.rastros, liveRastros, consultadoEm)
              : fallback.rastros,
        };
        memCache.set(key, { result, em: Date.now() });
        return result;
      } catch {
        return fallback;
      }
    },
  };
}
