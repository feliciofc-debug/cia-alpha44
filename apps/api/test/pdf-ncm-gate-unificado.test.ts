import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import { criarNcmCatalog, criarPdfNcmAuditCtx, loadNcmVigente, validarNcmItem } from "@cia/pipeline";
import { auditarItemNcmParaPdf, itemBloqueiaPdfNcm } from "@cia/shared";

const catalog = criarNcmCatalog(loadNcmVigente());
const ctx = criarPdfNcmAuditCtx(catalog);

describe("gate PDF — front/back concordam (lote misto)", () => {
  const casos: Array<{ nome: string; it: Item; frontBackBloqueia: boolean }> = [
    {
      nome: "compatível lustre válido",
      it: {
        descOriginal: "Lustre de teto LED",
        descPt: "Lustre de teto LED",
        descDuimp: "Lustre",
        ncm: "94052100",
        ncmValido: true,
        compatibilidadeProduto: "compativel",
        pesoLiqKg: 1,
        fobTotalUS: 10,
        aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
      } as Item,
      frontBackBloqueia: false,
    },
    {
      nome: "revisar",
      it: {
        descOriginal: "Peça",
        descPt: "Peça",
        descDuimp: "Peça",
        ncm: "87149490",
        compatibilidadeProduto: "revisar",
        pesoLiqKg: 1,
        fobTotalUS: 10,
        aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
      } as Item,
      frontBackBloqueia: true,
    },
    {
      nome: "incompatível",
      it: {
        descOriginal: "Chapa",
        descPt: "Chapa",
        descDuimp: "Chapa",
        ncm: "72085200",
        compatibilidadeProduto: "incompativel",
        pesoLiqKg: 1,
        fobTotalUS: 10,
        aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
      } as Item,
      frontBackBloqueia: true,
    },
    {
      nome: "NCM inexistente",
      it: {
        descOriginal: "X",
        descPt: "X",
        descDuimp: "X",
        ncm: "99999999",
        compatibilidadeProduto: "compativel",
        pesoLiqKg: 1,
        fobTotalUS: 10,
        aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
      } as Item,
      frontBackBloqueia: true,
    },
    {
      nome: "azeite compatível validar ok (família alimentos)",
      it: {
        descOriginal: "Azeite de oliva extravirgem, em embalagem de vidro de 1 litro",
        descPt: "Azeite de oliva extravirgem, em embalagem de vidro de 1 litro",
        descDuimp: "Azeite",
        ncm: "15092000",
        ncmValido: true,
        ncmConfianca: 0.97,
        ncmFonte: "ia",
        compatibilidadeProduto: "compativel",
        pesoLiqKg: 1,
        fobTotalUS: 10,
        aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
      } as Item,
      frontBackBloqueia: false,
    },
  ];

  for (const { nome, it: itemCase, frontBackBloqueia } of casos) {
    it(nome, () => {
      const audit = auditarItemNcmParaPdf(itemCase, ctx);
      expect(itemBloqueiaPdfNcm(itemCase, ctx)).toBe(audit.bloqueia);
      expect(audit.bloqueia).toBe(frontBackBloqueia);
      if (nome === "azeite compatível validar ok (família alimentos)") {
        const validar = validarNcmItem("15092000", itemCase.descPt, catalog, "ia");
        expect(validar.ok).toBe(true);
      }
    });
  }
});
