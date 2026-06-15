import { describe, expect, it } from "vitest";
import {
  criarNcmCatalog,
  detectarFamilia,
  detectarFamilias,
  loadNcmVigente,
  montarCandidatosPasse1,
  ncmCoerenteComFamilia,
} from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

function capPrincipal(desc: string) {
  const fam = detectarFamilia(desc);
  const p1 = montarCandidatosPasse1(catalog, desc, fam, 15, { descOriginal: desc });
  return { fam, caps: p1.map((c) => c.posicao4.slice(0, 2)), p1 };
}

describe("etapa 2 — brinquedos reais (anti-regressão)", () => {
  it("boneca → brinquedos / 9503", () => {
    const { fam, caps } = capPrincipal("boneca de pano infantil");
    expect(fam?.id).toBe("brinquedos");
    expect(caps.some((c) => c === "95")).toBe(true);
    expect(fam?.prefixos.some((p) => p.startsWith("9503"))).toBe(true);
  });

  it("puzzle / quebra-cabeça → brinquedos / 9503", () => {
    expect(detectarFamilia("puzzle 1000 peças")?.id).toBe("brinquedos");
    expect(detectarFamilia("quebra-cabeça 500 peças")?.id).toBe("brinquedos");
  });

  it("jogo de tabuleiro → brinquedos / 9504", () => {
    const fam = detectarFamilia("jogo de tabuleiro infantil família");
    expect(fam?.id).toBe("brinquedos");
    expect(fam?.prefixos).toContain("9504");
    const { caps } = capPrincipal("jogo de tabuleiro xadrez madeira");
    expect(caps.some((c) => c === "95")).toBe(true);
  });

  it("carrinho RC / toy car → brinquedos / 9503", () => {
    expect(detectarFamilia("carrinho de controle remoto RC toy car 1:24")?.id).toBe("brinquedos");
  });

  it("blocos de montar / building blocks → brinquedos / 9503", () => {
    expect(detectarFamilia("blocos de montar educativos 120 peças")?.id).toBe("brinquedos");
    expect(detectarFamilia("building blocks set for kids")?.id).toBe("brinquedos");
  });

  it("figura colecionável China → brinquedos / 9503 ou 9505", () => {
    const fam = detectarFamilia("figura colecionável anime PVC 15cm");
    expect(fam?.id).toBe("brinquedos");
    expect(fam?.prefixos.some((p) => p.startsWith("9503") || p.startsWith("9505"))).toBe(true);
  });

  it("玩具 ZH → brinquedos", () => {
    expect(detectarFamilia("儿童玩具 塑料积木")?.id).toBe("brinquedos");
  });
});

describe("etapa 2 — falsos positivos de jogo (não brinquedo)", () => {
  it("jogo de chaves de boca → ferramentas_manual / 82", () => {
    const det = detectarFamilias("jogo de chaves de boca 12 peças métricas");
    expect(det.familias.map((f) => f.familia.id)).toContain("ferramentas_manual");
    expect(det.familias.map((f) => f.familia.id)).not.toContain("brinquedos");
    const { caps } = capPrincipal("jogo de chaves de boca 12 peças");
    expect(caps.some((c) => c === "82")).toBe(true);
  });

  it("jogo de chaves de fenda → ferramentas / 82", () => {
    const det = detectarFamilias("jogo de chaves de fenda 32 peças cromo-vanádio");
    expect(det.familias.map((f) => f.familia.id)).not.toContain("brinquedos");
    expect(
      det.familias.some((f) =>
        ["ferramentas_manual", "ferramentas_maquina"].includes(f.familia.id),
      ),
    ).toBe(true);
  });

  it("jogo de panelas / Kochtopf → cozinha_utensilios / 73", () => {
    const descPt = "Jogo de panelas aço inox 5 peças com tampa de vidro";
    const fam = detectarFamilia(descPt);
    expect(fam?.id).toBe("cozinha_utensilios");
    const { caps } = capPrincipal(descPt);
    expect(caps.some((c) => c === "73")).toBe(true);
    expect(detectarFamilia("DE-KU-2002 Kochtopf-Set 5-teilig Edelstahl")?.id).toBe(
      "cozinha_utensilios",
    );
  });

  it("jogo de lençóis → textil_cama_mesa / cap 63", () => {
    const fam = detectarFamilia("jogo de lençóis casal 4 peças algodão");
    expect(fam?.id).toBe("textil_cama_mesa");
    expect(fam?.prefixos).toContain("63");
    expect(detectarFamilias("jogo de lençóis casal 4 peças").familias.map((f) => f.familia.id)).not.toContain(
      "brinquedos",
    );
  });
});

describe("etapa 2 — conflito toy+iluminação ainda funciona", () => {
  it("Lustre toy LED ainda dispara brinquedos + iluminacao", () => {
    const r = detectarFamilias("Lustre toy LED gift for kids chandelier");
    expect(r.familias.length).toBeGreaterThanOrEqual(2);
    expect(r.familias.map((f) => f.familia.id)).toContain("brinquedos");
    expect(r.familias.map((f) => f.familia.id)).toContain("iluminacao");
  });
});

describe("etapa 2 — coerência NCM tabuleiro", () => {
  it("95042000 coerente com brinquedos", () => {
    const fam = detectarFamilia("jogo de tabuleiro")!;
    expect(ncmCoerenteComFamilia("95042000", fam)).toBe(true);
  });
});
