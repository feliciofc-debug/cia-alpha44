import { describe, it, expect } from "vitest";
import { extrairAliquotasTtce } from "../src/siscomex/ttce-parser.js";

describe("extrairAliquotasTtce", () => {
  it("extrai II e IPI de atributos", () => {
    const r = extrairAliquotasTtce({
      ncm: "94052100",
      tratamentosTributarios: [
        {
          tributo: { nome: "IMPOSTO DE IMPORTAÇÃO" },
          regime: { codigo: "1" },
          fundamentoLegal: { codigo: "0003", nome: "ALÍQUOTA TEC" },
          mercadorias: [{ atributos: [{ codigo: "ATT_15670", valor: "16.2" }] }],
        },
        {
          tributo: { nome: "IPI" },
          regime: { codigo: "1" },
          fundamentoLegal: { codigo: "6999", nome: "IPI normal" },
          mercadorias: [{ atributos: [{ codigo: "ATT_2870", valor: "9.75" }] }],
        },
      ],
    });
    expect(r.ii).toBeCloseTo(0.162);
    expect(r.ipi).toBeCloseTo(0.0975);
  });
});
