#!/usr/bin/env node
/**
 * Planilha de fornecedor — teste final E2E CIA Alpha 44.
 * Cobre: NCM informado, itens sem NCM (IA), pesos caixa×qtd, FOB/kg, categorias diversas.
 *
 * Uso: node tools/gerar-planilha-teste-final.cjs [pasta-saida]
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const outDir =
  process.argv[2] || path.join(process.env.USERPROFILE || ".", "Desktop", "testes-cia-alpha44");
const outFile = path.join(outDir, "TESTE-FINAL-CIA-10itens.xlsx");

const headers = [
  "品名\nTrade name",
  "产品图片\nIMAGEM",
  "品名（英文）\nTrade name",
  "品牌\nBrands/ Marcas",
  "产品型号\nmodel/ modelo",
  "外箱编号（唛头）\nREF",
  "总箱数 \nCX/ Caixa no total",
  "每箱数量\nQuantity per case/ Quantidade por caixa",
  "总数量\nQTD TOT/ Quantidade total",
  "箱规（CM)\nsize/ tamanho",
  "",
  "",
  "总方数CBM TOT/ Cubic meter total",
  "单箱净重\nNet weight per box（KG）",
  "总净重 Total Net Weight（KG）",
  "单箱毛重\nGross weight of a single box（KG）",
  "总毛重 Total Gross Weight（KG）",
  "材质Material",
  "是否带电(with electricity?/ com eletricidade?)",
  "DescRIÇÃO EM Portugues",
  "NCM",
  "VALOR FOB / KG",
  "VALOR TOTAL FOB / KG",
  "I.I.",
  "IPI",
  "PIS",
  "COFINS",
];

const subHeader = ["", "", "", "", "", "", "", "", "", "L", "w", "H", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];

/** 10 itens — lustres, bebidas, ferramentas, sem NCM (IA). Pesos: total = cx × peso/caixa. */
const itens = [
  {
    cn: "吊灯",
    en: "chandelier crystal",
    model: "TC-F01",
    cx: 40,
    qpc: 2,
    l: 45,
    w: 45,
    h: 12,
    cbm: 0.972,
    nwBox: 2.2,
    gwBox: 2.55,
    mat: "ABS+铁",
    eletric: "否",
    pt: "LUSTRE DE CRISTAL",
    ncm: "9405.10.93",
    fobKg: 2.35,
  },
  {
    cn: "吸顶灯",
    en: "ceiling LED lamp",
    model: "TC-F02",
    cx: 25,
    qpc: 4,
    l: 38,
    w: 38,
    h: 9,
    cbm: 0.325,
    nwBox: 1.4,
    gwBox: 1.65,
    mat: "ABS+铝",
    eletric: "是",
    pt: "LUMINÁRIA DE TETO LED",
    ncm: "9405.21.00",
    fobKg: 1.92,
  },
  {
    cn: "苏格兰威士忌",
    en: "Scotch whisky 12yo 750ml",
    model: "UK-BEV-WHIS-12",
    cx: 120,
    qpc: 6,
    l: 32,
    w: 24,
    h: 28,
    cbm: 2.58,
    nwBox: 8.5,
    gwBox: 9.8,
    mat: "玻璃+纸",
    eletric: "否",
    pt: "WHISKY ESCOCÊS 750ML",
    ncm: "2208.30.20",
    fobKg: 4.85,
  },
  {
    cn: "马黛茶提取物",
    en: "yerba mate instant extract powder",
    model: "BR-TEA-MATE-01",
    cx: 30,
    qpc: 20,
    l: 40,
    w: 30,
    h: 25,
    cbm: 0.9,
    nwBox: 6.0,
    gwBox: 6.5,
    mat: "植物提取物",
    eletric: "否",
    pt: "EXTRATO INSTANTÂNEO DE ERVA-MATE",
    ncm: "2101.20.10",
    fobKg: 3.4,
  },
  {
    cn: "活动扳手",
    en: "adjustable wrench set",
    model: "TL-WRENCH-8",
    cx: 15,
    qpc: 12,
    l: 35,
    w: 25,
    h: 18,
    cbm: 0.236,
    nwBox: 4.2,
    gwBox: 4.8,
    mat: "铬钒钢",
    eletric: "否",
    pt: "CHAVE INGLESA AJUSTÁVEL",
    ncm: "8204.20.00",
    fobKg: 2.1,
  },
  {
    cn: "真皮手提包",
    en: "genuine leather handbag",
    model: "BG-LTH-01",
    cx: 20,
    qpc: 10,
    l: 50,
    w: 40,
    h: 30,
    cbm: 1.2,
    nwBox: 3.5,
    gwBox: 4.0,
    mat: "真皮",
    eletric: "否",
    pt: "BOLSA DE COURO GENUÍNO",
    ncm: "4202.92.00",
    fobKg: 5.6,
  },
  {
    cn: "自行车轮圈",
    en: "bicycle wheel rim 26 inch",
    model: "BK-RIM-26",
    cx: 10,
    qpc: 8,
    l: 70,
    w: 70,
    h: 15,
    cbm: 0.735,
    nwBox: 5.8,
    gwBox: 6.4,
    mat: "铝合金",
    eletric: "否",
    pt: "ARO DE RODA DE BICICLETA 26 POL",
    ncm: "8714.10.00",
    fobKg: 2.75,
  },
  {
    cn: "断路器",
    en: "mini circuit breaker 32A",
    model: "EL-MCB-32",
    cx: 8,
    qpc: 50,
    l: 30,
    w: 20,
    h: 15,
    cbm: 0.072,
    nwBox: 2.0,
    gwBox: 2.3,
    mat: "塑料+铜",
    eletric: "是",
    pt: "DISJUNTOR MINI 32A",
    ncm: "8536.61.00",
    fobKg: 6.2,
  },
  {
    cn: "蓝牙耳机",
    en: "wireless TWS earphones Bluetooth 5.3",
    model: "AUD-TWS-05",
    cx: 50,
    qpc: 40,
    l: 28,
    w: 22,
    h: 18,
    cbm: 0.554,
    nwBox: 1.8,
    gwBox: 2.0,
    mat: "ABS+锂电池",
    eletric: "是",
    pt: "FONE DE OUVIDO BLUETOOTH TWS",
    ncm: "",
    fobKg: 8.5,
  },
  {
    cn: "硅胶蛋糕模",
    en: "silicone baking cake mold kitchen",
    model: "KIT-SIL-09",
    cx: 12,
    qpc: 24,
    l: 35,
    w: 30,
    h: 12,
    cbm: 0.151,
    nwBox: 1.2,
    gwBox: 1.35,
    mat: "食品级硅胶",
    eletric: "否",
    pt: "FORMA DE BOLO DE SILICONE",
    ncm: "",
    fobKg: 1.65,
  },
];

function enrich(it) {
  const qtd = it.cx * it.qpc;
  const nwTot = +(it.nwBox * it.cx).toFixed(3);
  const gwTot = +(it.gwBox * it.cx).toFixed(3);
  const fobTot = +(it.fobKg * nwTot).toFixed(2);
  return { ...it, qtd, nwTot, gwTot, fobTot };
}

const linhas = itens.map(enrich);

const totais = linhas.reduce(
  (a, it) => ({
    cx: a.cx + it.cx,
    qtd: a.qtd + it.qtd,
    nw: a.nw + it.nwTot,
    gw: a.gw + it.gwTot,
    fob: a.fob + it.fobTot,
  }),
  { cx: 0, qtd: 0, nw: 0, gw: 0, fob: 0 },
);

const totRow = [
  "",
  "",
  "",
  "",
  "Total",
  "",
  totais.cx,
  "",
  totais.qtd,
  "",
  "",
  "",
  "",
  "",
  +totais.nw.toFixed(3),
  "",
  +totais.gw.toFixed(3),
  "",
  "",
  "",
  "",
  "",
  +totais.fob.toFixed(2),
];

const rows = [
  totRow,
  headers,
  subHeader,
  ...linhas.map((it) => [
    it.cn,
    "",
    it.en,
    "",
    it.model,
    "N/M",
    it.cx,
    it.qpc,
    it.qtd,
    it.l,
    it.w,
    it.h,
    it.cbm,
    it.nwBox,
    it.nwTot,
    it.gwBox,
    it.gwTot,
    it.mat,
    it.eletric,
    it.pt,
    it.ncm,
    it.fobKg,
    it.fobTot,
    0.162,
    0.0975,
    0.021,
    0.0965,
  ]),
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", +totais.nw.toFixed(3), "", +totais.gw.toFixed(3), "", "", "", "", "", +totais.fob.toFixed(2)],
];

const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = headers.map(() => ({ wch: 16 }));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

fs.mkdirSync(outDir, { recursive: true });
XLSX.writeFile(wb, outFile);

console.log("Gerado:", outFile);
console.log("Itens:", linhas.length);
console.log("FOB total US$:", totais.fob.toFixed(2));
console.log("Peso líq kg:", totais.nw.toFixed(2));
console.log("Peso bruto kg:", totais.gw.toFixed(2));
console.log("");
console.log("Roteiro sugerido:");
console.log("  1. Upload → classificar (itens 9-10 sem NCM → IA)");
console.log("  2. Confirmar NCM nos pendentes (mate 2101 vs IA possível)");
console.log("  3. Calcular → salvar cotação");
console.log("  4. Editar FOB/kg em 1-2 itens → ver recálculo");
console.log("  5. Gerar PDF");
