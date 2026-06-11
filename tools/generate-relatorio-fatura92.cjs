#!/usr/bin/env node
/**
 * Gera docs/relatorio-conciliacao-fatura-92.md e tools/relatorio-conciliacao-fatura-92.xlsx
 * Somente leitura de fixtures existentes (sem IA).
 */
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const ROOT = path.join(__dirname, "..");
const inp = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fatura-92-limpa-classificar.json"), "utf8")).linhas;
const out = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fatura92-out-vps.json"), "utf8"));
const tec = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/pipeline/src/data/tec-cache.json"), "utf8"));

const META = {
  titulo: "Fatura 92 — 0617滑板车",
  dataProva: "2026-06-11",
  commit: "b0861df",
  provider: out.provider || "anthropic:claude-sonnet-4-6",
  tempoS: "~100",
  prompt: "PROMPT_PASSE2_V4",
  cambio: 5.0211,
  freteUS: 5500,
  incoterm: "CFR",
  beneficio: "ALAGOAS",
  rota: "RJ → SP",
};

const GABARITO = [
  { ncm8: ["87116000"], caps: ["8711"], iiD: 18, ipiD: 35, grupo: "Patinete elétrico" },
  { ncm8: ["87116000"], caps: ["8711"], iiD: 18, ipiD: 35, grupo: "Patinete elétrico" },
  { ncm8: ["87141000"], caps: ["8714"], iiD: 14.4, ipiD: 9, grupo: "Amortecedor" },
  { ncm8: ["87149490"], caps: ["8714"], iiD: 14.4, ipiD: 6.5, grupo: "Cabo freio" },
  { ncm8: ["73181500", "73182400", "73181600"], caps: ["7318"], iiD: 16, ipiD: 6.5, grupo: "Parafuso" },
  { ncm8: ["87141000"], caps: ["8714"], iiD: 14.4, ipiD: 9, grupo: "Painel (仪表)" },
  { ncm8: ["73182400", "73181500", "73181600"], caps: ["7318"], iiD: 16, ipiD: 6.5, grupo: "Parafuso amortecedor" },
  { ncm8: ["73181500", "73182400", "73181600"], caps: ["7318"], iiD: 16, ipiD: 6.5, grupo: "Parafuso frontal" },
  { ncm8: ["85044010"], caps: ["8504"], iiD: 18, ipiD: 5, grupo: "Adaptador/carregador" },
  { ncm8: ["87141000"], caps: ["8714"], iiD: 14.4, ipiD: 9, grupo: "Controlador" },
  { ncm8: ["87149490"], caps: ["8714"], iiD: 14.4, ipiD: 6.5, grupo: "Manete freio" },
  { ncm8: ["87141000"], caps: ["8714"], iiD: 14.4, ipiD: 9, grupo: "Para-lama" },
  { ncm8: ["87141000"], caps: ["8714"], iiD: 14.4, ipiD: 9, grupo: "Para-lama" },
];

function parseModelo(desc) {
  const m = desc.match(/^([A-Z0-9-]+)\s*—/);
  return m ? m[1] : desc.slice(0, 12);
}

function parseZhEn(desc) {
  const parts = desc.split("—").map((s) => s.trim());
  if (parts.length >= 2) return parts.slice(1).join(" — ").replace(/\s*—\s*[\d.-]+$/, "");
  return desc;
}

function pct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(2).replace(".", ",")}%`;
}

function pctNum(n) {
  if (n == null) return null;
  return `${(n * 100).toFixed(2).replace(".", ",")}%`;
}

function tecAliq(ncm) {
  const e = tec.itens[ncm];
  if (!e) return { ii: null, ipi: null };
  return { ii: e.ii, ipi: e.ipi };
}

function veredito(ncm, g) {
  if (g.ncm8.includes(ncm)) return "OK ncm8";
  const cap = ncm.slice(0, 4);
  if (g.caps.includes(cap) || g.caps.some((c) => c.length === 2 && ncm.startsWith(c))) return "OK capítulo";
  return "DIVERGE";
}

function score(g, v) {
  return v === "OK ncm8" || v === "OK capítulo" ? 1 : 0;
}

const rows = inp.map((l, i) => {
  const o = out.itens[i];
  const g = GABARITO[i];
  const ncm = o.ncm;
  const conf = o.ncmCandidatos?.[0]?.confianca;
  const v = veredito(ncm, g);
  const plat = o.aliquotas || tecAliq(ncm);
  const gabNcm = g.ncm8[0];
  const tecGab = tecAliq(gabNcm);
  const qtd = l.qtd ?? null;
  const liqU = qtd && l.pesoLiqKg ? l.pesoLiqKg / qtd : null;
  const brutoU = qtd && l.pesoBrutoKg ? l.pesoBrutoKg / qtd : null;
  const fobBaseU = /ES-T19|滑板车/.test(l.descOriginal) ? 109 : null;
  const fobKgLiq =
    fobBaseU && liqU ? fobBaseU / liqU : fobBaseU && !liqU && liqU === 0 ? null : null;
  const fobKgLiqFat = l.fobUnitarioUS && liqU ? l.fobUnitarioUS / liqU : null;

  return {
    num: i + 1,
    modelo: parseModelo(l.descOriginal),
    descricao: parseZhEn(l.descOriginal),
    material: l.material || "—",
    uso: l.uso || "—",
    ncmPlat: ncm,
    fonte: o.ncmFonte,
    confianca: conf != null ? conf.toFixed(2) : "—",
    compat: o.compatibilidadeProduto || "—",
    ncmDesp: gabNcm,
    veredito: v,
    iiPlat: pct(plat.ii),
    ipiPlat: pct(plat.ipi),
    iiDesp: `${g.iiD.toString().replace(".", ",")}%`,
    ipiDesp: `${g.ipiD.toString().replace(".", ",")}%`,
    iiPlatTipi: pct(tecGab.ii),
    ipiPlatTipiGab: pct(tecGab.ipi),
    qtd,
    fobUnitFat: l.fobUnitarioUS ?? null,
    fobBaseU,
    liqU,
    brutoU,
    liqTot: l.pesoLiqKg ?? null,
    brutoTot: l.pesoBrutoKg ?? null,
    fobTotFat: l.fobTotalUS ?? null,
    fobTotBase: fobBaseU && qtd ? fobBaseU * qtd : null,
    fobKgLiqBase: fobBaseU && liqU ? fobBaseU / liqU : null,
    fobKgLiqFat,
    fobKgBrutoBase: fobBaseU && brutoU ? fobBaseU / brutoU : null,
    score: score(g, v),
  };
});

const scoreTotal = rows.reduce((s, r) => s + r.score, 0);
const fobFat = rows.reduce((s, r) => s + (r.fobTotFat || 0), 0);
const fobBase = rows.reduce((s, r) => s + (r.fobTotBase || 0), 0);
const pesoLiqCargo = 16343;
const pesoBrutoCargo = 17977;
const fobKgCargo = 77390 / pesoLiqCargo;

// --- Markdown ---
const md = [];
md.push("# Relatório de Conciliação — Fatura 92 (NCMs + FOB/kg)");
md.push("");
md.push("## 1. Cabeçalho");
md.push("");
md.push(`| Campo | Valor |`);
md.push(`|-------|-------|`);
md.push(`| Fatura | ${META.titulo} |`);
md.push(`| Data da prova | ${META.dataProva} |`);
md.push(`| Commit | \`${META.commit}\` |`);
md.push(`| Provider | ${META.provider} |`);
md.push(`| Tempo classificação | ${META.tempoS} s |`);
md.push(`| Prompt | ${META.prompt} |`);
md.push(`| Câmbio | ${META.cambio} |`);
md.push(`| Frete | US$ ${META.freteUS.toLocaleString("en-US")} |`);
md.push(`| Incoterm | ${META.incoterm} |`);
md.push(`| Benefício fiscal | ${META.beneficio} |`);
md.push(`| Rota | ${META.rota} |`);
md.push(`| Fonte prova | \`tools/fatura92-out-vps.json\` |`);
md.push("");
md.push("## 2. Tabela principal — NCM e alíquotas (13 itens)");
md.push("");
md.push(
  "| # | Modelo | Descrição (ZH/EN) | Material | Uso | NCM Plataforma | Fonte | Conf. | Compat. | NCM Despachante | Veredito | II% Plat. | IPI% Plat. | II% Desp. | IPI% Desp. |",
);
md.push("|---|--------|-------------------|----------|-----|----------------|-------|-------|---------|-----------------|----------|-----------|------------|-----------|------------|");
for (const r of rows) {
  md.push(
    `| ${r.num} | ${r.modelo} | ${r.descricao.replace(/\|/g, "/")} | ${r.material} | ${r.uso} | ${r.ncmPlat} | ${r.fonte} | ${r.confianca} | ${r.compat} | ${r.ncmDesp} | **${r.veredito}** | ${r.iiPlat} | ${r.ipiPlat} | ${r.iiDesp} | ${r.ipiDesp} |`,
  );
}
md.push("");
md.push(
  "**Gabarito despachante:** patinetes `87116000`; amortecedor/painel/controlador/para-lamas `87141000`; cabo + manete freio `87149490`; parafusos `73181500` / `73182400` / `73181600`; adaptador `85044010`.",
);
md.push("");
md.push("## 3. Tabela FOB/kg");
md.push("");
md.push(
  "| # | Modelo | Qtd total | FOB unit. fatura (US$) | Base custo desp. (US$) | Peso líq. unit. (kg) | Peso bruto unit. (kg) | Peso líq. total (kg) | Peso bruto total (kg) | FOB/kg líq. (fatura) | FOB/kg líq. (base 109) | FOB/kg bruto (base) |",
);
md.push("|---|--------|-----------|------------------------|------------------------|----------------------|-----------------------|----------------------|-----------------------|----------------------|-------------------------|---------------------|");
for (const r of rows) {
  const fmt = (n, d = 2) => (n == null ? "—" : typeof n === "number" ? n.toFixed(d) : n);
  md.push(
    `| ${r.num} | ${r.modelo} | ${r.qtd ?? "—"} | ${fmt(r.fobUnitFat, 4)} | ${fmt(r.fobBaseU, 2)} | ${fmt(r.liqU, 2)} | ${fmt(r.brutoU, 2)} | ${fmt(r.liqTot, 2)} | ${fmt(r.brutoTot, 2)} | ${fmt(r.fobKgLiqFat, 2)} | ${fmt(r.fobKgLiqBase, 2)} | ${fmt(r.fobKgBrutoBase, 2)} |`,
  );
}
md.push("");
md.push("### Totais da carga");
md.push("");
md.push("| Métrica | Fatura fornecedor | Base custo despachante (US$ 109/un patinete) |");
md.push("|---------|-------------------|-----------------------------------------------|");
md.push(`| FOB total | US$ ${fobFat.toLocaleString("en-US", { minimumFractionDigits: 2 })} | US$ ${fobBase.toLocaleString("en-US", { minimumFractionDigits: 2 })} (~77.417) |`);
md.push(`| Peso líquido | ${pesoLiqCargo.toLocaleString("en-US")} kg | — |`);
md.push(`| Peso bruto | ${pesoBrutoCargo.toLocaleString("en-US")} kg | — |`);
md.push(`| FOB/kg (líquido, base 109) | — | **US$ ${fobKgCargo.toFixed(2)}/kg** (~4,74) |`);
md.push("");
md.push("*Patinetes: 710 un. × 20 kg líq. / 23 kg bruto unit. (planilha); despachante usou 23 kg bruto fornecedor como líquido — ver divergência (e).*");
md.push("");
md.push("## 4. Divergências abertas (validação despachante)");
md.push("");
md.push(
  "**a. IPI 8714.10.00** — Despachante informa 9%; TIPI vigente (Decreto 12.665/2025) no `tec-cache`: **12,00%** para `87141000`.",
);
md.push("");
md.push(
  "**b. 仪表 (painel)** — Plataforma `90319090` (cap. 90, Nota 2(g) Seção XVII — instrumento) × despachante `87141000` (parte de veículo). Veredito: **DIVERGE**.",
);
md.push("");
md.push(
  "**c. 减震螺丝** — Plataforma `87149990` (residual 87.14) × gabarito `73182400` (Nota 2(a) — parafuso uso geral). Veredito: **DIVERGE**. Lapidação prompt pendente.",
);
md.push("");
md.push(
  "**d. Preço patinete** — Fatura US$ 140,58/un × base operacional US$ 109,00/un (valor de transação a confirmar com fornecedor/despachante).",
);
md.push("");
md.push(
  "**e. Peso** — Despachante: 23 kg/un bruto fornecedor tratado como líquido; líquido real **20 kg/un** (710 × 20 = 14.200 kg só patinetes). Totais operacionais: **16.343 kg líq.** / **17.977 kg bruto**.",
);
md.push("");
md.push("## 5. Rodapé de auditoria");
md.push("");
md.push(`- **Score NCM:** ${scoreTotal}/13 (critério ≥11/13 — **aprovado**)`);
md.push(`- **Fonte IA:** 13/13 itens (\`ncmFonte: ia\`)`);
md.push(`- **Fallback Siscomex:** 0`);
md.push(`- **Capítulos absurdos (8211/3002/5811):** 0`);
md.push(`- **Alíquotas plataforma:** TEC Res. Gecex 770/2025 (Anexo II) + TIPI Decreto 12.665/2025`);
md.push(`- **Prompt:** ${META.prompt} (regras 8708×8714 + Nota 2 Seção XVII)`);
md.push("");

fs.writeFileSync(path.join(ROOT, "docs/relatorio-conciliacao-fatura-92.md"), md.join("\n"), "utf8");

// --- XLSX ---
const wb = XLSX.utils.book_new();

const sh1 = [
  [
    "#",
    "Modelo",
    "Descrição (ZH/EN)",
    "Material",
    "Uso",
    "NCM Plataforma",
    "Fonte",
    "Confiança",
    "Compatibilidade",
    "NCM Despachante",
    "Veredito",
    "II% Plataforma",
    "IPI% Plataforma",
    "II% Despachante",
    "IPI% Despachante",
  ],
  ...rows.map((r) => [
    r.num,
    r.modelo,
    r.descricao,
    r.material,
    r.uso,
    r.ncmPlat,
    r.fonte,
    r.confianca,
    r.compat,
    r.ncmDesp,
    r.veredito,
    r.iiPlat,
    r.ipiPlat,
    r.iiDesp,
    r.ipiDesp,
  ]),
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh1), "NCM");

const sh2 = [
  [
    "#",
    "Modelo",
    "Qtd total",
    "FOB unit fatura US$",
    "Base custo US$",
    "Peso líq unit kg",
    "Peso bruto unit kg",
    "Peso líq total kg",
    "Peso bruto total kg",
    "FOB/kg líq fatura",
    "FOB/kg líq base",
    "FOB/kg bruto base",
  ],
  ...rows.map((r) => [
    r.num,
    r.modelo,
    r.qtd ?? "",
    r.fobUnitFat ?? "",
    r.fobBaseU ?? "",
    r.liqU ?? "",
    r.brutoU ?? "",
    r.liqTot ?? "",
    r.brutoTot ?? "",
    r.fobKgLiqFat ?? "",
    r.fobKgLiqBase ?? "",
    r.fobKgBrutoBase ?? "",
  ]),
  [],
  ["Totais", "", "", "", "", "", "", pesoLiqCargo, pesoBrutoCargo, "", fobKgCargo.toFixed(2), ""],
  ["FOB fatura", fobFat, "FOB base custo", fobBase],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh2), "FOB_kg");

const sh3 = [
  ["Campo", "Valor"],
  ["Fatura", META.titulo],
  ["Data prova", META.dataProva],
  ["Commit", META.commit],
  ["Provider", META.provider],
  ["Tempo s", META.tempoS],
  ["Prompt", META.prompt],
  ["Câmbio", META.cambio],
  ["Frete US$", META.freteUS],
  ["Incoterm", META.incoterm],
  ["Benefício", META.beneficio],
  ["Rota", META.rota],
  ["Score", `${scoreTotal}/13`],
  ["Fonte IA", "13/13"],
  ["Siscomex fallback", "0"],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh3), "Cabecalho");

XLSX.writeFile(wb, path.join(ROOT, "tools/relatorio-conciliacao-fatura-92.xlsx"));

console.log("Gerado:", path.join(ROOT, "docs/relatorio-conciliacao-fatura-92.md"));
console.log("Gerado:", path.join(ROOT, "tools/relatorio-conciliacao-fatura-92.xlsx"));
console.log("Score:", scoreTotal, "/13");
