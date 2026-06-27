import { describe, it, expect } from "vitest";
import {
  AVISO_TRADUCAO_PT_INDISPONIVEL,
  extrairTraducaoPtEmbutida,
  formatDescPt,
  resolverDescPtFornecedor,
  temCaractereCjk,
} from "../src/traducao-pt.js";

describe("traducao-pt", () => {
  it("extrai PT embutido após segmento ZH (cot 72 HY-97)", () => {
    const desc =
      "HY-97;挂钩秤;Balança de gancho portátil (dinamômetro de pesagem) — aparelho de pesagem, outros, capacidade não superior a 30 kg";
    expect(extrairTraducaoPtEmbutida(desc)).toContain("Balança de gancho portátil");
    const { descPt, avisoTraducao } = resolverDescPtFornecedor(desc);
    expect(descPt).toBe(
      "HY-97 — Balança de gancho portátil (dinamômetro de pesagem) — aparelho de pesagem, outros, capacidade não superior a 30 kg",
    );
    expect(avisoTraducao).toBeUndefined();
    expect(temCaractereCjk(descPt)).toBe(false);
  });

  it("formatDescPt evita duplicar prefixo do modelo", () => {
    expect(formatDescPt("HY-5169", "HY-5169 — Cabide dobrável")).toBe(
      "HY-5169 — Cabide dobrável",
    );
  });

  it("fallback honesto quando só há ZH", () => {
    const { descPt, avisoTraducao } = resolverDescPtFornecedor("HY-99;仅中文描述");
    expect(descPt).toMatch(/^HY-99 — /);
    expect(temCaractereCjk(descPt)).toBe(true);
    expect(avisoTraducao).toBe(AVISO_TRADUCAO_PT_INDISPONIVEL);
  });

  it("não usa chinês puro como modelo nem duplica descrição quando falta tradução", () => {
    const { descPt, avisoTraducao } = resolverDescPtFornecedor("电动滑板车");

    expect(descPt).toBe("电动滑板车");
    expect(descPt).not.toBe("电动滑板车 — 电动滑板车");
    expect(avisoTraducao).toBe(AVISO_TRADUCAO_PT_INDISPONIVEL);
  });

  it("traduz chinês puro sem prefixar falso modelo", () => {
    const { descPt } = resolverDescPtFornecedor("电池", "Bateria");

    expect(descPt).toBe("Bateria");
  });

  it("usa candidato LLM sem CJK quando planilha não tem PT embutido", () => {
    const { descPt } = resolverDescPtFornecedor(
      "DE-WZ-1001 — Akku-Bohrschrauber 18V",
      "Parafusadeira sem fio 18V",
    );
    expect(descPt).toBe("DE-WZ-1001 — Parafusadeira sem fio 18V");
  });
});
