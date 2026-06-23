#!/usr/bin/env node
/**
 * Gera planilha de fornecedor (formato cliente) para testes no CIA Alpha 44.
 * Uso: node tools/gerar-planilha-teste-fornecedor.cjs [pasta-saida]
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const outDir = process.argv[2] || path.join(process.env.USERPROFILE || ".", "Desktop", "testes cursor.claude");
const outFile = path.join(outDir, "TESTE-CURSOR-fatura-luminarias-5itens.xlsx");

/** Cabeçalho bilíngue — mesmo padrão da fatura 16 (fornecedor chinês). */
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

/** 5 itens variados — lustres + luminária, 2 NCMs, pesos distintos. */
const itens = [
  {
    cn: "吊灯",
    en: "chandelier",
    model: "TC-01",
    ref: "N/M",
    cx: 50,
    qpc: 2,
    qtd: 100,
    l: 45,
    w: 45,
    h: 12,
    cbm: 1.215,
    nwBox: 2.1,
    nwTot: 105,
    gwBox: 2.4,
    gwTot: 120,
    mat: "ABS+铁",
    eletric: "否",
    pt: "LUSTRE",
    ncm: "9405.10.93",
    fobKg: 2.15,
    fobTot: 225.75,
  },
  {
    cn: "过道灯",
    en: "aisle light",
    model: "TC-02-W",
    ref: "N/M",
    cx: 20,
    qpc: 6,
    qtd: 120,
    l: 30,
    w: 20,
    h: 10,
    cbm: 0.36,
    nwBox: 1.2,
    nwTot: 24,
    gwBox: 1.45,
    gwTot: 29,
    mat: "ABS+铁",
    eletric: "否",
    pt: "LUSTRE / LUMINÁRIA",
    ncm: "9405.10.93",
    fobKg: 1.95,
    fobTot: 46.8,
  },
  {
    cn: "壁灯",
    en: "wall lamp",
    model: "TC-03-B",
    ref: "N/M",
    cx: 15,
    qpc: 4,
    qtd: 60,
    l: 35,
    w: 12,
    h: 12,
    cbm: 0.252,
    nwBox: 0.85,
    nwTot: 12.75,
    gwBox: 1.0,
    gwTot: 15,
    mat: "ABS+铁",
    eletric: "否",
    pt: "LUMINÁRIA DE PAREDE",
    ncm: "9405.11.90",
    fobKg: 2.4,
    fobTot: 30.6,
  },
  {
    cn: "吸顶灯",
    en: "ceiling lamp",
    model: "TC-04",
    ref: "N/M",
    cx: 30,
    qpc: 3,
    qtd: 90,
    l: 40,
    w: 40,
    h: 8,
    cbm: 0.768,
    nwBox: 1.5,
    nwTot: 45,
    gwBox: 1.75,
    gwTot: 52.5,
    mat: "ABS+铝",
    eletric: "否",
    pt: "LUMINÁRIA DE TETO",
    ncm: "9405.11.90",
    fobKg: 1.88,
    fobTot: 84.6,
  },
  {
    cn: "台灯",
    en: "table lamp",
    model: "TC-05",
    ref: "N/M",
    cx: 10,
    qpc: 8,
    qtd: 80,
    l: 25,
    w: 25,
    h: 15,
    cbm: 0.375,
    nwBox: 0.65,
    nwTot: 6.5,
    gwBox: 0.78,
    gwTot: 7.8,
    mat: "ABS",
    eletric: "是",
    pt: "LUMINÁRIA DE MESA",
    ncm: "9405.21.00",
    fobKg: 3.1,
    fobTot: 20.15,
  },
];

const totais = itens.reduce(
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
  totais.nw,
  "",
  totais.gw,
  "",
  "",
  "",
  "",
  "",
  totais.fob,
];

const rows = [
  totRow,
  headers,
  subHeader,
  ...itens.map((it) => [
    it.cn,
    "",
    it.en,
    "",
    it.model,
    it.ref,
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
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", totais.nw, "", totais.gw, "", "", "", "", "", totais.fob],
];

const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = headers.map(() => ({ wch: 14 }));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

fs.mkdirSync(outDir, { recursive: true });
XLSX.writeFile(wb, outFile);

console.log("Gerado:", outFile);
console.log("Itens:", itens.length);
console.log("FOB total US$:", totais.fob.toFixed(2));
console.log("Peso líq kg:", totais.nw.toFixed(2));
console.log("Peso bruto kg:", totais.gw.toFixed(2));
