import { describe, it, expect } from "vitest";
import {
  lookupBenchmark,
  calibrarFobKg,
  analisarRisco,
  normalizarNcm,
  parseSupplierOcrText,
} from "../src/index.js";

describe("Benchmark ComexStat", () => {
  it("encontra NCM da planilha 66 (8204.20.00) — métrica ponderada ComexStat", () => {
    const b = lookupBenchmark("8204.20.00");
    expect(b.fonte).toBe("ComexStat");
    expect(b.fobKgPonderado).not.toBeNull();
    expect(b.mediaFobKg).toBeNull();
    expect(b.amostra).toBeGreaterThanOrEqual(0);
  });

  it("retorna sem base para NCM inexistente", () => {
    const b = lookupBenchmark("99999999");
    expect(b.fonte).toBe("sem base");
    expect(b.mediaFobKg).toBeNull();
  });

  it("normaliza NCM com pontos", () => {
    expect(normalizarNcm("8204.20.00")).toBe("82042000");
  });
});

describe("Calibrador FOB/KG", () => {
  it("mantém FOB dentro da faixa", () => {
    const benchmark = lookupBenchmark("82042000");
    const r = calibrarFobKg({
      fobKgInformado: 1.4,
      pesoLiqKg: 100,
      benchmark,
    });
    expect(r.fobKgCalibrado).toBeGreaterThan(0);
  });

  it("eleva FOB abaixo do piso defensável", () => {
    const benchmark = lookupBenchmark("82042000");
    if (benchmark.pisoDefensavel === null) return;
    const r = calibrarFobKg({
      fobKgInformado: 0.01,
      pesoLiqKg: 100,
      benchmark,
    });
    expect(r.fobKgCalibrado).toBeGreaterThanOrEqual(benchmark.pisoDefensavel);
    expect(r.ajustado).toBe(true);
  });
});

describe("Análise de risco", () => {
  it("marca cinza quando muito abaixo do benchmark", () => {
    const benchmark = lookupBenchmark("82042000");
    const calibracao = calibrarFobKg({
      fobKgInformado: 0.001,
      pesoLiqKg: 100,
      benchmark,
    });
    const risco = analisarRisco({
      ncm: "82042000",
      descPt: "Chaves de fenda",
      calibracao,
      benchmark,
    });
    expect(["CINZA_VALORACAO", "VERMELHO_TECNICO", "AMARELO_TECNICO"]).toContain(
      risco.canal,
    );
  });
});

describe("Fotos WPS (.xls DISPIMG)", () => {
  it("extrai imagens do stream ETCellImageData", async () => {
    const { extrairImagensWpsOle } = await import("../src/wps-images.js");
    const fs = await import("node:fs");
    const path = "c:/Users/usuario/Desktop/processos china/装箱单出货清单.xls";
    if (!fs.existsSync(path)) return;
    const buf = fs.readFileSync(path);
    const imgs = extrairImagensWpsOle(buf);
    expect(imgs.length).toBeGreaterThanOrEqual(5);
  });

  it("vincula fotos DISPIMG às linhas da 装箱单", async () => {
    const fs = await import("node:fs");
    const path = "c:/Users/usuario/Desktop/processos china/装箱单出货清单.xls";
    if (!fs.existsSync(path)) return;
    const { parseSupplierFile } = await import("../src/parser.js");
    const parsed = await parseSupplierFile(new Uint8Array(fs.readFileSync(path)));
    const comFoto = parsed.linhas.filter((l) => l.fotoBase64).length;
    expect(comFoto).toBeGreaterThanOrEqual(5);
  });
});

describe("Fotos da planilha", () => {
  it("associa imagens às linhas por número de linha Excel", async () => {
    const { associarFotosLinhas } = await import("../src/xlsx-images.js");
    const linhas = [{ linha: 9 }, { linha: 10 }];
    const fotos = new Map([
      [9, { linhaExcel: 9, buffer: Buffer.from("abc"), mime: "image/jpeg" }],
      [10, { linhaExcel: 10, buffer: Buffer.from("def"), mime: "image/png" }],
    ]);
    const out = associarFotosLinhas(linhas, fotos);
    expect(out[0]?.fotoBase64).toBe(Buffer.from("abc").toString("base64"));
    expect(out[1]?.fotoMime).toBe("image/png");
  });
});

describe("Parser OCR", () => {
  it("converte texto tabulado em linhas de item", () => {
    const texto = [
      "货号\t产品配置\tFOB USD",
      "C2\t空心杯无人机\t120",
      "C7\t四轴飞行器\t85",
    ].join("\n");
    const r = parseSupplierOcrText(texto, "teste.pdf");
    expect(r.totalLinhas).toBeGreaterThanOrEqual(2);
    expect(r.linhas[0]?.descOriginal).toContain("C2");
  });

  it("converte linhas coladas do PDF nativo (sem espaços entre colunas)", () => {
    const texto = [
      "1LED Panel Light 36W 600x600mm / LED面板灯500600.008.504,250.00",
      "2Cordless Drill 18V with 2 Batteries / 无绳电钻300540.0022.006,600.00",
      "4Cotton T-Shirt 180gsm / 纯棉T恤2000360.001.953,900.00",
    ].join("\n");
    const r = parseSupplierOcrText(texto, "cotacao.pdf");
    expect(r.totalLinhas).toBe(3);
    expect(r.linhas[0]?.fobTotalUS).toBe(4250);
    expect(r.linhas[1]?.qtd).toBe(300);
    expect(r.linhas[2]?.descOriginal).toContain("Cotton");
  });

  it("converte linhas OCR com espaços simples (cotação PDF)", () => {
    const texto = [
      "No. Description / 品名 Qty / 数量 Net Weight (kg) Unit Price USD FOB Total USD",
      "1 LED Panel Light 36W 600x600mm / LED面板灯 500 600.00 8.50 4,250.00",
      "2 Cordless Drill 18V with 2 Batteries / 无绳电钻 300 540.00 22.00 6,600.00",
      "3 Bluetooth Earphones TWS / 蓝牙耳机 1000 50.00 4.80 4,800.00",
    ].join("\n");
    const r = parseSupplierOcrText(texto, "cotacao-shenzhen.pdf");
    expect(r.totalLinhas).toBeGreaterThanOrEqual(3);
    expect(r.linhas[0]?.descOriginal).toContain("LED Panel");
    expect(r.linhas[0]?.fobTotalUS).toBe(4250);
    expect(r.linhas[1]?.qtd).toBe(300);
  });
});
