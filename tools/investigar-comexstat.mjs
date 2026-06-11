#!/usr/bin/env node
/**
 * Diagnóstico somente-leitura: API ComexStat vs planilha mensal INNOVE.
 * NÃO altera comexstat-api.ts — investigação paralela à T6.
 *
 * Uso: node tools/investigar-comexstat.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = "https://api-comexstat.mdic.gov.br/general";
const RELATORIO_PATH = join(__dirname, "relatorio-comexstat.md");

/** Mesmos filtros de packages/pipeline/src/comexstat-api.ts */
const COMEXSTAT_CHINA_MARITIMO_2023S1 = {
  paisId: 160,
  viaId: "01",
  periodoDe: "2023-01",
  periodoAte: "2023-06",
};

const NCMS_ALVO = ["94051190", "94051110", "94052100", "87116000", "85044010", "73269090"];

/** Valor confirmado na planilha mensal (média simples por DI, amostra ~1952). */
const FOB_KG_PLANILHA_94051190 = 1.90724668715675;

const PER_PAGE_TESTE = 100;

function normNcm(v) {
  return String(v ?? "")
    .replace(/\D/g, "")
    .padStart(8, "0")
    .slice(0, 8);
}

function num(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bodyConsulta(filtros = COMEXSTAT_CHINA_MARITIMO_2023S1) {
  return {
    flow: "import",
    period: { from: filtros.periodoDe, to: filtros.periodoAte },
    filters: [
      { filter: "country", values: [filtros.paisId] },
      { filter: "via", values: [filtros.viaId] },
    ],
    details: ["ncm"],
    metrics: ["metricFOB", "metricKG", "metricCIF"],
  };
}

/** Réplica exata do conector atual (sem language=pt, sem paginação). */
async function fetchComoConectorAtual(tentativa = 0) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(bodyConsulta()),
  });
  if (res.status === 429 && tentativa < 3) {
    await sleep(11_000);
    return fetchComoConectorAtual(tentativa + 1);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`ComexStat HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  const raw = json.data;
  const list = Array.isArray(raw) ? raw : raw?.list ?? [];
  return { json, list, url: API_URL };
}

/** Consulta com language=pt e parâmetros de paginação na query string. */
async function fetchPagina(page, perPage, tentativa = 0) {
  const url = `${API_URL}?language=pt&page=${page}&perPage=${perPage}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(bodyConsulta()),
  });
  if (res.status === 429 && tentativa < 3) {
    await new Promise((r) => setTimeout(r, 11_000));
    return fetchPagina(page, perPage, tentativa + 1);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`ComexStat HTTP ${res.status} p${page}: ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  const list = json.data?.list ?? (Array.isArray(json.data) ? json.data : []);
  return { json, list, url };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extrairMetadataResposta(json) {
  const data = json.data ?? {};
  const candidatos = [
    "totalPages",
    "totalRecords",
    "total",
    "page",
    "perPage",
    "currentPage",
    "recordsTotal",
    "totalElements",
  ];
  const meta = {};
  for (const k of candidatos) {
    if (data[k] !== undefined) meta[`data.${k}`] = data[k];
    if (json[k] !== undefined) meta[k] = json[k];
  }
  if (json.processo_info != null) meta.processo_info = json.processo_info;
  if (json.message != null) meta.message = json.message;
  meta.language = json.language;
  meta.success = json.success;
  meta.dataKeys = data && typeof data === "object" ? Object.keys(data) : [];
  return meta;
}

/** Tenta 2ª página só se a 1ª parecer truncada. */
async function fetchTodasPaginas(perPage = 500, primeiraPagina) {
  const paginas = [
    {
      page: 1,
      perPage,
      url: primeiraPagina.url,
      linhas: primeiraPagina.list.length,
      metadata: extrairMetadataResposta(primeiraPagina.json),
      primeiroNcm: normNcm(primeiraPagina.list[0]?.coNcm),
      ultimoNcm: normNcm(primeiraPagina.list[primeiraPagina.list.length - 1]?.coNcm),
    },
  ];

  const agregado = [...primeiraPagina.list];
  const truncada = primeiraPagina.list.length >= perPage;

  if (truncada) {
    await sleep(1500);
    const p2 = await fetchPagina(2, perPage);
    const hash1 = `${paginas[0].linhas}:${paginas[0].primeiroNcm}:${paginas[0].ultimoNcm}`;
    const hash2 = `${p2.list.length}:${normNcm(p2.list[0]?.coNcm)}:${normNcm(p2.list[p2.list.length - 1]?.coNcm)}`;
    paginas.push({
      page: 2,
      perPage,
      url: p2.url,
      linhas: p2.list.length,
      metadata: extrairMetadataResposta(p2.json),
      primeiroNcm: normNcm(p2.list[0]?.coNcm),
      ultimoNcm: normNcm(p2.list[p2.list.length - 1]?.coNcm),
      repetida: hash1 === hash2,
    });
    if (hash1 !== hash2) {
      for (const row of p2.list) {
        const ncm = normNcm(row.coNcm);
        if (!agregado.some((r) => normNcm(r.coNcm) === ncm)) agregado.push(row);
      }
    }
  }

  return { agregado, paginas };
}

function fobKgDeRow(row) {
  const kg = num(row.metricKG);
  const fob = num(row.metricFOB);
  if (kg <= 0 || fob <= 0) return null;
  return fob / kg;
}

function mapaPorNcm(list) {
  const map = new Map();
  for (const row of list) {
    const ncm = normNcm(row.coNcm);
    if (ncm.length === 8) map.set(ncm, row);
  }
  return map;
}

function coberturaNcms(map, rotulo) {
  const out = {};
  for (const ncm of NCMS_ALVO) {
    out[ncm] = map.has(ncm) ? "presente" : "ausente";
  }
  return { rotulo, ...out };
}

function pctDiff(api, ref) {
  if (!ref) return null;
  return ((api - ref) / ref) * 100;
}

function tabelaMarkdown(rows) {
  if (!rows.length) return "_vazio_";
  const cols = Object.keys(rows[0]);
  const sep = cols.map(() => "---");
  const head = `| ${cols.join(" | ")} |`;
  const line = `| ${sep.join(" | ")} |`;
  const body = rows.map((r) => `| ${cols.map((c) => String(r[c] ?? "")).join(" | ")} |`).join("\n");
  return [head, line, body].join("\n");
}

async function main() {
  const log = [];
  const w = (s = "") => {
    console.log(s);
    log.push(s);
  };

  w("# Relatório ComexStat — investigação paralela");
  w("");
  w(`Gerado em: ${new Date().toISOString()}`);
  w("");
  w("## Filtros (COMEXSTAT_CHINA_MARITIMO_2023S1)");
  w("");
  w("```json");
  w(JSON.stringify(COMEXSTAT_CHINA_MARITIMO_2023S1, null, 2));
  w("```");
  w("");
  w("Planilha mensal (cabeçalho linha 3): 2023-S1 · país 160 · via marítima 01 — mesma fonte.");
  w("");

  w("## 1. Paginação e metadata");
  w("");

  const { json: jsonP1, list: listP1, url: urlP1 } = await fetchPagina(1, PER_PAGE_TESTE);
  const metaP1 = extrairMetadataResposta(jsonP1);

  w(`**1ª requisição paginada:** \`${urlP1}\``);
  w(`- Linhas retornadas na 1ª página (perPage=${PER_PAGE_TESTE}): **${listP1.length}**`);
  w(`- Metadata extraída do JSON cru:`);
  w("```json");
  w(JSON.stringify(metaP1, null, 2));
  w("```");
  w("");

  const { agregado: listCompleto, paginas } = await fetchTodasPaginas(500, {
    json: jsonP1,
    list: listP1,
    url: urlP1,
  });
  w(`**Loop paginação (perPage=500):** ${paginas.length} requisição(ões)`);
  w("");
  w(
    tabelaMarkdown(
      paginas.map((p) => ({
        página: p.page,
        linhas: p.linhas,
        primeiroNcm: p.primeiroNcm,
        ultimoNcm: p.ultimoNcm,
        repetida: p.repetida ?? "—",
        totalPages: p.metadata["data.totalPages"] ?? "—",
        totalRecords: p.metadata["data.totalRecords"] ?? "—",
      })),
    ),
  );
  w("");

  await sleep(1500);
  const { json: jsonCon, list: listCon } = await fetchComoConectorAtual();
  w("## 2. Conector atual vs paginação");
  w("");
  w(`- Conector atual (\`fetchComexStatImport\`): **${listCon.length}** linhas (1 POST, sem \`language=pt\`, sem loop)`);
  w(`- Paginação agregada: **${listCompleto.length}** linhas únicas`);
  w(`- Resposta 1ª página com perPage=${PER_PAGE_TESTE}: **${listP1.length}** linhas`);
  w("");

  const hipotesePrimeiraPagina =
    listP1.length < listCon.length && listP1.length <= PER_PAGE_TESTE;
  if (metaP1["data.totalPages"] || metaP1["data.totalRecords"]) {
    w(
      `> Metadata reporta totalPages/totalRecords — conector deveria paginar até cobrir o total.`,
    );
  } else if (listP1.length === listCon.length) {
    w(
      "> **Hipótese 1ª página:** REFUTADA para estes filtros — API devolve o dataset inteiro num único \`data.list\` (~5788 NCMs), mesmo com \`page=1&perPage=100\`. Parâmetros \`page/perPage\` aparentemente **ignorados** neste endpoint/consulta.",
    );
  } else if (hipotesePrimeiraPagina) {
    w(
      "> **Hipótese 1ª página:** CONFIRMADA — conector lê só a 1ª fatia; paginação necessária.",
    );
  }
  w("");

  w("Amostra JSON cru (top-level + 1º item), conector atual:");
  w("```json");
  w(
    JSON.stringify(
      {
        keys: Object.keys(jsonCon),
        dataKeys: Object.keys(jsonCon.data ?? {}),
        language: jsonCon.language,
        processo_info: jsonCon.processo_info,
        primeiroItem: listCon[0],
      },
      null,
      2,
    ).slice(0, 3500),
  );
  w("```");
  w("");

  w("## 3. Cobertura NCMs alvo");
  w("");

  const mapCon = mapaPorNcm(listCon);
  const mapP1 = mapaPorNcm(listP1);
  const mapFull = mapaPorNcm(listCompleto);

  const simPrimeiraPagina = mapaPorNcm(listCon.slice(0, PER_PAGE_TESTE));

  const linhasCobertura = NCMS_ALVO.map((ncm) => {
    const row = mapCon.get(ncm);
    return {
      NCM: ncm,
      conector_atual: mapCon.has(ncm) ? "presente" : "ausente",
      pagina_1_per100: mapP1.has(ncm) ? "presente" : "ausente",
      slice_100_conector: simPrimeiraPagina.has(ncm) ? "presente" : "ausente",
      paginacao_completa: mapFull.has(ncm) ? "presente" : "ausente",
      FOB_USD: row ? num(row.metricFOB).toLocaleString("en-US") : "—",
      KG: row ? num(row.metricKG).toLocaleString("en-US") : "—",
    };
  });

  w(tabelaMarkdown(linhasCobertura));
  w("");
  w(
    "Coluna `slice_100_conector`: simula o que aconteceria se o conector usasse apenas as **100 primeiras linhas** da resposta (ordem da API, não NCM).",
  );
  w("");

  w("## 4. Valor 94051190 — API vs planilha");
  w("");

  const row9405 = mapCon.get("94051190");
  const fobKgApi = row9405 ? fobKgDeRow(row9405) : null;
  const diff = fobKgApi != null ? pctDiff(fobKgApi, FOB_KG_PLANILHA_94051190) : null;

  w("| Métrica | Valor |");
  w("| --- | --- |");
  w(`| Planilha mensal FOB/kg (média simples DI, ~1952 refs) | ${FOB_KG_PLANILHA_94051190} |`);
  w(`| API metricFOB / metricKG (agregado semestre) | ${fobKgApi?.toFixed(8) ?? "N/A"} |`);
  w(`| Diferença % (API − planilha) / planilha | ${diff != null ? `${diff.toFixed(2)}%` : "N/A"} |`);
  if (row9405) {
    w(`| API metricFOB (USD) | ${num(row9405.metricFOB).toLocaleString("en-US")} |`);
    w(`| API metricKG | ${num(row9405.metricKG).toLocaleString("en-US")} |`);
  }
  w("");

  if (diff != null && Math.abs(diff) > 5) {
    w(
      "> **Hipótese valor:** CONFIRMADA — divergência grande. API ComexStat retorna **FOB total ÷ KG total** (média ponderada pelo volume importado no semestre). Planilha INNOVE (~1952 DIs) usa **média aritmética simples** de FOB/kg por DI (`1,90724668715675`). Não é erro de paginação.",
    );
  }
  w("");

  w("## 5. Resumo executivo");
  w("");
  w(tabelaMarkdown([
    {
      métrica: "Linhas 1ª req (perPage=100)",
      valor: listP1.length,
    },
    {
      métrica: "Linhas conector atual",
      valor: listCon.length,
    },
    {
      métrica: "Linhas paginação agregada",
      valor: listCompleto.length,
    },
    {
      métrica: "totalPages / totalRecords na API",
      valor: metaP1["data.totalPages"] ?? metaP1["data.totalRecords"] ?? "não informado",
    },
    {
      métrica: "NCMs alvo presentes (conector)",
      valor: `${NCMS_ALVO.filter((n) => mapCon.has(n)).length}/${NCMS_ALVO.length}`,
    },
    {
      métrica: "NCMs alvo na simulação slice(100)",
      valor: `${NCMS_ALVO.filter((n) => simPrimeiraPagina.has(n)).length}/${NCMS_ALVO.length}`,
    },
    {
      métrica: "94051190 FOB/kg API",
      valor: fobKgApi?.toFixed(6) ?? "N/A",
    },
    {
      métrica: "94051190 FOB/kg planilha",
      valor: FOB_KG_PLANILHA_94051190,
    },
    {
      métrica: "Diferença %",
      valor: diff != null ? `${diff.toFixed(2)}%` : "N/A",
    },
  ]));
  w("");
  w("## Próximo passo (fora deste script)");
  w("");
  w("- Ajuste benchmark T6: priorizar **planilha mensal** (média simples) sobre ComexStat agregado quando ambos existirem.");
  w("- Se no futuro a API passar a respeitar `page/perPage`, implementar loop até `totalPages` em `comexstat-api.ts`.");
  w("");

  writeFileSync(RELATORIO_PATH, log.join("\n"), "utf8");
  console.log(`\nRelatório gravado em ${RELATORIO_PATH}`);
}

main().catch((e) => {
  console.error("ERRO:", e.message ?? e);
  process.exit(1);
});
