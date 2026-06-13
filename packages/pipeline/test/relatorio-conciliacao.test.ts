import { describe, it, expect } from "vitest";
import { AVISO_MOEDA_EUR_V1 } from "@cia/shared";
import { confiancaNcmFinal } from "../src/confianca-ncm.js";
import {
  FONTE_ALIQUOTA_TEC_PADRAO,
  fonteAliquotaItem,
  gerarCsvConciliacao,
  metaConciliacao,
  montarLinhasConciliacao,
  nomeArquivoConciliacao,
  totaisConciliacao,
} from "../src/relatorio-conciliacao.js";
import { montarRastroTributo, PIS_COFINS_FONTE_PADRAO } from "@cia/shared";
import type { Item } from "@cia/shared";

function itemBase(partial: Partial<Item> & Pick<Item, "descOriginal">): Item {
  return {
    descPt: partial.descOriginal,
    descDuimp: "",
    ncm: "87116000",
    ncmCandidatos: [],
    pesoBrutoKg: 23,
    pesoLiqKg: 20,
    qtd: 1,
    fobUnitarioUS: 109,
    fobTotalUS: 109,
    aliquotas: { ii: 0.18, ipi: 0.35, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    ...partial,
  } as Item;
}

describe("confiancaNcmFinal", () => {
  it("usa confiança do candidato cujo NCM coincide com o final (não [0])", () => {
    expect(
      confiancaNcmFinal("87149990", [
        { ncm: "87141000", confianca: 0.95 },
        { ncm: "87149990", confianca: 0.82 },
      ]),
    ).toBe(0.82);
  });

  it("fallback confiancaPasse2 quando top coincide com final", () => {
    expect(confiancaNcmFinal("87116000", [{ ncm: "87116000", confianca: 0.97 }], 0.97)).toBe(0.97);
  });

  it("guard-rail mantém planilha — confiança null se IA top diverge", () => {
    expect(
      confiancaNcmFinal("87116000", [{ ncm: "87149990", confianca: 0.9 }], 0.9),
    ).toBeNull();
  });
});

describe("relatorio-conciliacao", () => {
  it("meta conciliação — moeda planilha EUR + aviso v1", () => {
    const meta = metaConciliacao({
      cotacao: {
        cliente: "DE Packliste",
        empresaTrade: "Alpha 44",
        benefFiscal: "ALAGOAS",
        moeda: "US$",
        moedaPlanilha: "EUR",
        cambio: 5.2,
        freteTotalUS: 0,
        adicionaisVaUS: 0,
        reducaoBaseUS: 0,
        siscomex: 0,
        antidumpingBRL: 0,
        incoterm: "CFR",
        origem: "RJ",
        destino: "SP",
        itens: [],
        despesas: [],
        params: {
          markupPct: 0.06,
          pisSaida: 0.0165,
          cofinsSaida: 0.076,
          icmsSaida: 0.04,
          csllSobreMarkup: 0.09,
          irrfAliq: 0.25,
          irrfBaseNotaPct: 0.027,
          ipiTetoAliqMedia: 0.15,
          icmsEntrada: 0,
        },
      },
      itens: [],
      provider: "anthropic",
    });
    expect(meta.find(([k]) => k === "Moeda planilha")?.[1]).toBe("EUR");
    expect(meta.find(([k]) => k === "Aviso moeda")?.[1]).toBe(AVISO_MOEDA_EUR_V1);
  });

  it("exporta ncmConfianca do item, não candidatos[0]", () => {
    const itens = [
      itemBase({
        descOriginal: "ACC-ES-SSA001 — 减震器",
        ncm: "87149990",
        ncmConfianca: 0.82,
        ncmCandidatos: [{ ncm: "87141000", confianca: 0.95 }],
        uso: "配件",
        material: "铁",
      }),
    ];
    const [linha] = montarLinhasConciliacao(itens);
    expect(linha!.ncmConfianca).toBe("0.82");
    expect(linha!.material).toBe("铁");
    expect(linha!.descZhEn).toContain("减震器");
  });

  it("fonte alíquota — rastro por tributo vs manual vs legado", () => {
    const comRastro = itemBase({
      descOriginal: "x",
      aliquotasRastro: {
        ii: montarRastroTributo(0.18, "tec-cache", "Res. Gecex 770/2025", "2026-06-11T10:00:00Z"),
        ipi: montarRastroTributo(0.35, "tec-cache", "Decreto 12.665/2025", "2026-06-11T10:00:00Z"),
        pis: montarRastroTributo(0.021, "tec-cache", PIS_COFINS_FONTE_PADRAO, "2026-06-11T10:00:00Z"),
        cofins: montarRastroTributo(0.0965, "tec-cache", PIS_COFINS_FONTE_PADRAO, "2026-06-11T10:00:00Z"),
      },
    });
    const [linhaRastro] = montarLinhasConciliacao([comRastro]);
    expect(linhaRastro!.fonteII).toContain("Gecex");
    expect(linhaRastro!.fontePIS).toBe(PIS_COFINS_FONTE_PADRAO);
    expect(linhaRastro!.consultadoEm).toBeTruthy();

    expect(
      fonteAliquotaItem(itemBase({ descOriginal: "x", aliquotasOverride: true })),
    ).toBe("manual (editado na cotação)");

    const [linhaLegado] = montarLinhasConciliacao([itemBase({ descOriginal: "x" })]);
    expect(linhaLegado!.fonteII).toBe("legado");
    expect(fonteAliquotaItem(itemBase({ descOriginal: "x" }))).toBe(FONTE_ALIQUOTA_TEC_PADRAO);
  });

  it("CSV UTF-8 BOM + separador ; + descrição chinesa", () => {
    const buf = gerarCsvConciliacao({
      cotacao: {
        cliente: "Teste",
        benefFiscal: "ALAGOAS",
        moeda: "US$",
        cambio: 5,
        freteTotalUS: 0,
        adicionaisVaUS: 0,
        reducaoBaseUS: 0,
        siscomex: 0,
        antidumpingBRL: 0,
        incoterm: "CFR",
        origem: "RJ",
        destino: "SP",
        itens: [],
        despesas: [],
        params: {
          markupPct: 0.06,
          pisSaida: 0.0165,
          cofinsSaida: 0.076,
          icmsSaida: 0.04,
          csllSobreMarkup: 0.09,
          irrfAliq: 0.25,
          irrfBaseNotaPct: 0.027,
          ipiTetoAliqMedia: 0.15,
          icmsEntrada: 0,
        },
      },
      itens: [
        itemBase({
          descOriginal: "ES-T19A — 滑板车T1 MAX",
          descPt: "Patinete elétrico",
        }),
      ],
    });
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    const text = buf.toString("utf8");
    expect(text).toContain(";");
    expect(text).toContain("滑板车T1 MAX");
    expect(text).toContain("Fonte II");
    expect(text).toContain("Fonte PIS");
  });

  it("fobKg usa base bruta quando fobKgBase=bruto", () => {
    const [linha] = montarLinhasConciliacao([
      itemBase({
        descOriginal: "Lustre",
        fobTotalUS: 780.55,
        pesoLiqKg: 356,
        pesoBrutoKg: 370,
        fobKgBase: "bruto",
      }),
    ]);
    expect(Number(String(linha!.fobKg).replace(",", "."))).toBeCloseTo(780.55 / 370, 3);
  });

  it("totais conciliação — líq e bruto distintos", () => {
    const itens = [
      itemBase({ descOriginal: "Patinete A", pesoLiqKg: 10000, pesoBrutoKg: 11500, qtd: 500 }),
      itemBase({ descOriginal: "Patinete B", pesoLiqKg: 4200, pesoBrutoKg: 4830, qtd: 210 }),
    ];
    const { pesoLiqKg, pesoBrutoKg } = totaisConciliacao(itens);
    expect(pesoLiqKg).toBeCloseTo(14200, 0);
    expect(pesoBrutoKg).toBeCloseTo(16330, 0);
  });

  it("filename — fallback quando cliente só CJK/especiais", () => {
    expect(nomeArquivoConciliacao("0617滑板车", "abc123xyz456", new Date("2026-06-11"))).toBe(
      "conciliacao-cotacao-abc123xyz456-2026-06-11",
    );
    expect(nomeArquivoConciliacao("滑板车", "id1", new Date("2026-06-11"))).toBe(
      "conciliacao-cotacao-id1-2026-06-11",
    );
    expect(nomeArquivoConciliacao("Cliente ABC Ltda", null, new Date("2026-06-11"))).toBe(
      "conciliacao-cliente-abc-ltda-2026-06-11",
    );
  });
});
