import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import { criarNcmCatalog, criarPdfNcmAuditCtx, loadNcmVigente } from "@cia/pipeline";
import { auditarItemNcmParaPdf, itemBloqueiaPdfNcm } from "@cia/shared";

const catalog = criarNcmCatalog(loadNcmVigente());
const ctx = criarPdfNcmAuditCtx(catalog);

describe("gate PDF — NCM informado aceito (API)", () => {
  const mk = (partial: Partial<Item>): Item =>
    ({
      descOriginal: "X",
      descPt: "X",
      descDuimp: "X",
      ncm: "87149490",
      pesoLiqKg: 1,
      fobTotalUS: 10,
      aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
      ...partial,
    }) as Item;

  it("whisky 22083020 ncmValido false — libera", () => {
    const it = mk({ ncm: "22083020", ncmValido: false, compatibilidadeProduto: "revisar" });
    expect(auditarItemNcmParaPdf(it, ctx).bloqueia).toBe(false);
  });

  it("NCM inexistente 99999999 — libera se informado", () => {
    const it = mk({ ncm: "99999999", compatibilidadeProduto: "compativel" });
    expect(itemBloqueiaPdfNcm(it, ctx)).toBe(false);
  });

  it("NCM vazio — bloqueia", () => {
    const it = mk({ ncm: "", compatibilidadeProduto: "revisar" });
    expect(itemBloqueiaPdfNcm(it, ctx)).toBe(true);
  });

  it("revisar com NCM — libera", () => {
    const it = mk({ compatibilidadeProduto: "revisar" });
    expect(itemBloqueiaPdfNcm(it, ctx)).toBe(false);
  });
});
