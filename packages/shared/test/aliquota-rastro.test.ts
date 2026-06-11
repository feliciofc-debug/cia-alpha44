import { describe, it, expect } from "vitest";
import {
  PIS_COFINS_FONTE_PADRAO,
  aplicarOverrideManualAliquota,
  colunasConsultadoEmExport,
  desfazerOverrideManualAliquota,
  fonteExibicaoTributo,
  mesclarRastrosTtce,
  montarRastroTributo,
  rastrosLegadoFallback,
} from "../src/aliquota-rastro.js";
import type { Item } from "../src/schemas.js";

function itemBase(): Item {
  return {
    descOriginal: "X",
    descPt: "X",
    descDuimp: "",
    ncm: "87116000",
    ncmCandidatos: [],
    pesoLiqKg: 10,
    pesoBrutoKg: 11,
    qtd: 1,
    fobTotalUS: 100,
    aliquotas: { ii: 0.18, ipi: 0.35, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    aliquotasRastro: {
      ii: montarRastroTributo(0.18, "tec-cache", "Res. Gecex 770/2025", "2026-06-11T10:00:00.000Z"),
      ipi: montarRastroTributo(0.35, "tec-cache", "Decreto 12.665/2025", "2026-06-11T10:00:00.000Z"),
      pis: montarRastroTributo(0.021, "tec-cache", PIS_COFINS_FONTE_PADRAO, "2026-06-11T10:00:00.000Z"),
      cofins: montarRastroTributo(0.0965, "tec-cache", PIS_COFINS_FONTE_PADRAO, "2026-06-11T10:00:00.000Z"),
    },
  };
}

describe("aliquota-rastro", () => {
  it("override manual preserva valor e fonte original", () => {
    const it = itemBase();
    const editado = aplicarOverrideManualAliquota(it, "ii", 0.2, "operador@teste");
    expect(editado.aliquotas.ii).toBe(0.2);
    expect(editado.aliquotasRastro?.ii?.origem).toBe("manual");
    expect(editado.aliquotasRastro?.ii?.valorOriginal).toBe(0.18);
    expect(editado.aliquotasRastro?.ii?.fonteOriginal).toBe("Res. Gecex 770/2025");
    expect(editado.aliquotasRastro?.ii?.editadoPor).toBe("operador@teste");
    expect(editado.aliquotasOverride).toBe(true);
  });

  it("desfazer override restaura rastro original", () => {
    const editado = aplicarOverrideManualAliquota(itemBase(), "ii", 0.2);
    const restaurado = desfazerOverrideManualAliquota(editado, "ii");
    expect(restaurado.aliquotas.ii).toBe(0.18);
    expect(restaurado.aliquotasRastro?.ii?.origem).toBe("tec-cache");
    expect(restaurado.aliquotasOverride).toBe(false);
  });

  it("PIS/COFINS nunca rotulados como TEC/Gecex no padrão", () => {
    const it = itemBase();
    expect(it.aliquotasRastro?.pis?.fonte).toBe(PIS_COFINS_FONTE_PADRAO);
    expect(it.aliquotasRastro?.pis?.fonte).not.toMatch(/Gecex|TEC/i);
  });

  it("fallback legado quando cotação sem rastro", () => {
    const it = itemBase();
    delete it.aliquotasRastro;
    const r = rastrosLegadoFallback(it)!;
    expect(r.ii?.origem).toBe("legado");
    expect(fonteExibicaoTributo(r.ii, { legado: true })).toBe("legado");
  });

  it("consultadoEm — coluna única quando datas iguais", () => {
    const cols = colunasConsultadoEmExport(itemBase().aliquotasRastro);
    expect(cols.consultadoEm).toBe("2026-06-11 10:00:00");
    expect(cols.consultadoEmII).toBeUndefined();
  });

  it("consultadoEm — expande por tributo quando datas divergem", () => {
    const r = itemBase().aliquotasRastro!;
    const cols = colunasConsultadoEmExport({
      ...r,
      ipi: montarRastroTributo(0.35, "ttce", "TTCE IPI", "2026-06-12T08:00:00.000Z"),
    });
    expect(cols.consultadoEm).toBeUndefined();
    expect(cols.consultadoEmII).toBeTruthy();
    expect(cols.consultadoEmIPI).toBeTruthy();
  });

  it("mesclarRastrosTtce sobrescreve tributos ao vivo", () => {
    const base = itemBase().aliquotasRastro;
    const merged = mesclarRastrosTtce(
      base,
      { ii: { valor: 0.16, fonte: "Portal Único TTCE — II" } },
      "2026-06-12T12:00:00.000Z",
    );
    expect(merged.ii?.origem).toBe("ttce");
    expect(merged.ii?.valor).toBe(0.16);
    expect(merged.pis?.origem).toBe("tec-cache");
  });
});
