import { describe, it, expect, beforeEach } from "vitest";
import { criarNcmCatalog, loadNcmVigente } from "@cia/pipeline";
import {
  avaliarCompatibilidadeProduto,
  combinarCamadasABParaTeste,
} from "../src/siscomex/compatibilidade-produto.js";
import { limparCacheCompatibilidade } from "../src/siscomex/cache-compatibilidade-llm.js";
import {
  PROMPT_COMPATIBILIDADE_VERSION,
  SYSTEM_JUIZ_COMPATIBILIDADE,
  parseRespostaJuizCompatibilidade,
} from "../src/llm/prompt-compatibilidade.js";
import { OVERLAP_ALTO } from "../src/siscomex/heuristica-termos.js";
import { avisoCompatibilidadePdf } from "../../web/src/lib/ncm.ts";
import type { Item } from "../../web/src/lib/types.ts";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("prompt-compatibilidade — juiz, não advogado", () => {
  it("proíbe NCM alternativo no prompt e no parse", () => {
    expect(PROMPT_COMPATIBILIDADE_VERSION).toBe("PROMPT_COMPAT_V1");
    expect(SYSTEM_JUIZ_COMPATIBILIDADE).toContain("PROIBIDO sugerir NCM alternativo");
    expect(
      parseRespostaJuizCompatibilidade(
        '{"status":"incompativel","motivo":"Sugerir NCM alternativo 73181500"}',
      ),
    ).toBeNull();
    expect(
      parseRespostaJuizCompatibilidade('{"status":"revisar","motivo":"Subposição incerta na posição 9401."}'),
    ).toEqual({
      status: "revisar",
      motivo: "Subposição incerta na posição 9401.",
    });
  });
});

describe("camada (a) não condena sozinha", () => {
  it("família incompatível + overlap alto → revisar (nunca compativel)", () => {
    const decisao = combinarCamadasABParaTeste(
      {
        sinal: "indicio_incompativel",
        motivo: "Família iluminacao vs cap. 19",
      },
      { status: "compativel", score: OVERLAP_ALTO + 0.05, motivo: "overlap alto" },
    );
    expect(decisao).toBe("revisar");
  });

  it("família incompatível + heurística compativel overlap baixo → incompativel (regra dura)", () => {
    const decisao = combinarCamadasABParaTeste(
      {
        sinal: "indicio_incompativel",
        motivo: "Família parafusos vs cap. 19",
      },
      { status: "compativel", score: 0.1, motivo: "overlap falso" },
    );
    expect(decisao).toBe("incompativel");
  });

  it("família incompatível + overlap baixo → incompativel (a+b concordam)", () => {
    const decisao = combinarCamadasABParaTeste(
      {
        sinal: "indicio_incompativel",
        motivo: "Família parafusos vs cap. 19",
      },
      { status: "incompativel", score: 0.02, motivo: "sem termos em comum" },
    );
    expect(decisao).toBe("incompativel");
  });
});

describe("compatibilidade produto × NCM — casos obrigatórios", () => {
  beforeEach(() => limparCacheCompatibilidade());

  it("capítulo errado: Parafuso sextavado M8 + NCM 19011020 → incompativel", () => {
    const { resultado, precisaLlm } = avaliarCompatibilidadeProduto(catalog, {
      descricao: "Parafuso sextavado M8",
      ncm: "19011020",
    });
    expect(resultado.compatibilidadeProduto).toBe("incompativel");
    expect(precisaLlm).toBe(false);
    expect(resultado.motivoCompatibilidade.length).toBeGreaterThan(10);
  });

  it("subposição suspeita: cadeira estofada + NCM 94017100 → revisar", () => {
    const { resultado } = avaliarCompatibilidadeProduto(catalog, {
      descricao: "Cadeira estofada de altura ajustável base metálica",
      ncm: "94017100",
    });
    expect(resultado.compatibilidadeProduto).toBe("revisar");
    expect(resultado.motivoCompatibilidade).toMatch(/9401\.7|metálic|estofad/i);
  });

  it("fatura 16 OK: A77-W LUSTRE + NCM 94051190 → compativel", () => {
    const { resultado } = avaliarCompatibilidadeProduto(catalog, {
      descricao: "A77-W — LUSTRE / LUMINÁRIA",
      ncm: "94051190",
    });
    expect(resultado.compatibilidadeProduto).toBe("compativel");
  });

  it("E2E montarItens: parafuso + NCM 19011020 → incompativel (família na descOriginal)", () => {
    const descOriginal = "Parafuso sextavado M8";
    const descPtIa =
      "Parafuso sextavado M8 em aço carbono zincado para fixação industrial em preparações alimentícias";
    const ncm = "19011020";

    const viaOriginal = avaliarCompatibilidadeProduto(catalog, {
      descricao: descOriginal,
      descricaoFamilia: descOriginal,
      ncm,
    });
    expect(viaOriginal.resultado.compatibilidadeProduto).toBe("incompativel");

    const viaDescPtComFamiliaOriginal = avaliarCompatibilidadeProduto(catalog, {
      descricao: descPtIa,
      descricaoFamilia: descOriginal,
      ncm,
    });
    expect(viaDescPtComFamiliaOriginal.resultado.compatibilidadeProduto).not.toBe("compativel");
    expect(["incompativel", "revisar"]).toContain(
      viaDescPtComFamiliaOriginal.resultado.compatibilidadeProduto,
    );
  });

  it("E2E: amortecedor × NCM 8211.93.20 → incompativel ou revisar", () => {
    const { resultado } = avaliarCompatibilidadeProduto(catalog, {
      descricao: "Amortecedor dianteiro patinete elétrico",
      ncm: "82119320",
    });
    expect(["incompativel", "revisar"]).toContain(resultado.compatibilidadeProduto);
    expect(resultado.compatibilidadeProduto).not.toBe("compativel");
  });
});

describe("avisoCompatibilidadePdf", () => {
  it("formata banner com contagem", () => {
    const msg = avisoCompatibilidadePdf([
      { compatibilidadeProduto: "incompativel" } as Item,
      { compatibilidadeProduto: "compativel" } as Item,
      { compatibilidadeProduto: "incompativel" } as Item,
    ]);
    expect(msg).toBe(
      "2 item(ns) com possível incompatibilidade NCM × produto — revisar antes de enviar",
    );
  });
});
