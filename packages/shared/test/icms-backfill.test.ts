import { describe, expect, it } from "vitest";
import {
  auditarIcmsSaidaLegado,
  avisoIcmsLegadoDivergente,
  formatPctIcms,
} from "../src/icms-backfill.js";

describe("icms-backfill — auditoria conservadora", () => {
  it("icms salvo igual ao resolver → manualFlag false, sem aviso", () => {
    const r = auditarIcmsSaidaLegado({
      icmsSaidaSalvo: 0.04,
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
    });
    expect(r.icmsSaidaManualFlag).toBe(false);
    expect(r.avisosFiscais).toHaveLength(0);
    expect(r.icmsSaidaCalculado).toBe(0.04);
  });

  it("divergência legado 18% vs 4% interestadual → manualFlag true + aviso", () => {
    const r = auditarIcmsSaidaLegado({
      icmsSaidaSalvo: 0.18,
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
    });
    expect(r.icmsSaidaManualFlag).toBe(true);
    expect(r.avisosFiscais).toHaveLength(1);
    expect(r.avisosFiscais[0]).toMatch(/legado \(18%\)/);
    expect(r.avisosFiscais[0]).toMatch(/calculado \(4%/);
    expect(r.avisosFiscais[0]).toMatch(/revisar e confirmar/);
  });

  it("interna AL→AL 19% coincide → auto", () => {
    const r = auditarIcmsSaidaLegado({
      icmsSaidaSalvo: 0.19,
      ufEmpresa: "AL",
      destino: "AL",
      regimeIcms: "AL_DIFERIDO",
    });
    expect(r.icmsSaidaManualFlag).toBe(false);
  });

  it("formatPctIcms", () => {
    expect(formatPctIcms(0.04)).toBe("4");
    expect(formatPctIcms(0.195)).toBe("19.5");
  });

  it("avisoIcmsLegadoDivergente inclui fundamento", () => {
    const msg = avisoIcmsLegadoDivergente(0.18, 0.04, "Res. Senado Federal 13/2012");
    expect(msg).toContain("Res. Senado Federal 13/2012");
  });
});
