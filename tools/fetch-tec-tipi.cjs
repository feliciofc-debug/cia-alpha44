/**
 * Gera packages/pipeline/src/data/tec-cache.json a partir de fontes oficiais:
 * - II: MDIC Res. Gecex 272 (tec-aplicada-brasil.xlsx)
 * - IPI: RFB TIPI (tipi.xlsx)
 * - PIS/COFINS: padrão + pis-cofins-excecoes.json curado
 *
 * Trava: aborta se cobertura II ou IPI < 98% dos NCM-8 vigentes.
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const DATA_DIR = join(__dirname, "data-fontes");
const NCM_VIGENTE = join(ROOT, "packages", "pipeline", "src", "data", "ncm-vigente.json");
const OUT = join(ROOT, "packages", "pipeline", "src", "data", "tec-cache.json");
const OLD_CACHE = join(ROOT, "packages", "pipeline", "src", "data", "tec-cache.json");

const URLS = {
  tec: "https://www.gov.br/mdic/pt-br/assuntos/camex/estrategia-comercial/arquivos-listas/12-09-2025-anexos-i-a-x-resolucao-gecex-272-21.xlsx/@@download/file",
  tipi: "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx/@@download/file",
  autopecas:
    "https://www.gov.br/mdic/pt-br/assuntos/sdic/setor-automotivo/regime-autopecas/documentos-regime-de-autopecas/ListaAutopeasRes284v24032022.xlsx/@@download/file",
};

const FILES = {
  tec: join(DATA_DIR, "tec-aplicada-brasil.xlsx"),
  tipi: join(DATA_DIR, "tipi.xlsx"),
  autopecas: join(DATA_DIR, "autopecas-mdic.xlsx"),
  pisCofins: join(DATA_DIR, "pis-cofins-excecoes.json"),
};

const COBERTURA_MIN = 0.98;

const { parseTecMdic } = require("./lib/parse-tec-mdic.cjs");
const { parseTipiRfb } = require("./lib/parse-tipi-rfb.cjs");
const { carregarExcecoes, aplicarPisCofins } = require("./lib/parse-pis-cofins-excecoes.cjs");

async function baixarSeNecessario(localPath, url, label) {
  if (existsSync(localPath)) {
    console.log(`✓ ${label} — cache local ${localPath}`);
    return { path: localPath, baixadoEm: null, url };
  }
  console.log(`Baixando ${label}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${label}: HTTP ${res.status}`);
  mkdirSync(DATA_DIR, { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(localPath, buf);
  const em = new Date().toISOString();
  console.log(`✓ ${label} — ${buf.length} bytes → ${localPath}`);
  return { path: localPath, baixadoEm: em, url };
}

function carregarOldSeed() {
  if (!existsSync(OLD_CACHE)) return {};
  try {
    const raw = JSON.parse(readFileSync(OLD_CACHE, "utf8"));
    return raw.itens ?? {};
  } catch {
    return {};
  }
}

/** @type {Array<{ ncm: string, campo: string, antigo: number, novo: number, fonte: string }>} */
let divergencias = [];

function compararAntigo(ncm, entry, oldItens) {
  const old = oldItens[ncm];
  if (!old || typeof old !== "object") return;
  for (const campo of ["ii", "ipi", "pis", "cofins"]) {
    const antigo = old[campo];
    const novo = entry[campo];
    if (typeof antigo === "number" && Math.abs(antigo - novo) > 1e-6) {
      divergencias.push({ ncm, campo, antigo, novo, fonte: entry.fonte });
    }
  }
}

async function main() {
  console.log("=== fetch-tec-tipi.cjs ===\n");

  const metaArquivos = [];
  metaArquivos.push(await baixarSeNecessario(FILES.tec, URLS.tec, "TEC MDIC"));
  metaArquivos.push(await baixarSeNecessario(FILES.tipi, URLS.tipi, "TIPI RFB"));
  metaArquivos.push(await baixarSeNecessario(FILES.autopecas, URLS.autopecas, "Lista Autopeças MDIC"));

  if (!existsSync(FILES.pisCofins)) {
    console.log("Gerando pis-cofins-excecoes.json…");
    require("./build-pis-cofins-excecoes.cjs");
  }

  const oldItens = carregarOldSeed();
  divergencias = [];

  const ncmVigente = JSON.parse(readFileSync(NCM_VIGENTE, "utf8"));
  const ncms = Object.keys(ncmVigente.itens ?? {}).sort();
  console.log(`\nNCM-8 vigentes: ${ncms.length}`);
  console.log(`Seed antigo: ${Object.keys(oldItens).length} NCMs para comparar divergências`);

  const tec = parseTecMdic(metaArquivos[0].path);
  const tipi = parseTipiRfb(metaArquivos[1].path);
  const pisCfg = carregarExcecoes(FILES.pisCofins);

  let iiFound = 0;
  let ipiFound = 0;
  /** @type {Record<string, object>} */
  const itens = {};

  for (const ncm of ncms) {
    /** @type {string[]} */
    const avisos = [];

    const iiPct = tec.map.get(ncm);
    if (iiPct != null) iiFound++;
    else avisos.push("II ausente na planilha MDIC (Res. Gecex 272)");

    const ipiEntry = tipi.map.get(ncm);
    if (ipiEntry != null) ipiFound++;
    else avisos.push("IPI ausente na TIPI RFB");

    let ipi = 0;
    if (ipiEntry) {
      ipi = ipiEntry.rate / 100;
      if (ipiEntry.ipiNt) avisos.push("IPI NT (não tributado)");
      else if (ipiEntry.explicitZero) avisos.push("IPI 0% explícito na TIPI");
    }

    const pisCof = aplicarPisCofins(ncm, pisCfg);
    if (pisCof.aviso) avisos.push(pisCof.aviso);

    const fonte = [tec.fonte, tipi.fonte, pisCfg.fonte].join(" + ");
    const vigencia = `II: ${tec.vigencia} | IPI: ${tipi.vigencia}`;

    const entry = {
      ii: iiPct != null ? iiPct / 100 : 0,
      ipi,
      pis: pisCof.pis,
      cofins: pisCof.cofins,
      fonte,
      vigencia,
      fundamentoPisCofins: pisCof.fundamento,
      ...(avisos.length ? { avisos } : {}),
      ...(ipiEntry?.ipiNt ? { ipiNt: true } : {}),
    };

    if (oldItens[ncm]) compararAntigo(ncm, entry, oldItens);
    itens[ncm] = entry;
  }

  const pctII = iiFound / ncms.length;
  const pctIPI = ipiFound / ncms.length;
  console.log(`\nCobertura II:  ${iiFound}/${ncms.length} (${(pctII * 100).toFixed(2)}%)`);
  console.log(`Cobertura IPI: ${ipiFound}/${ncms.length} (${(pctIPI * 100).toFixed(2)}%)`);

  if (pctII < COBERTURA_MIN) {
    throw new Error(
      `ABORTADO: cobertura II ${(pctII * 100).toFixed(2)}% < ${COBERTURA_MIN * 100}% — verifique parsing MDIC`,
    );
  }
  if (pctIPI < COBERTURA_MIN) {
    throw new Error(
      `ABORTADO: cobertura IPI ${(pctIPI * 100).toFixed(2)}% < ${COBERTURA_MIN * 100}% — verifique parsing TIPI`,
    );
  }

  const out = {
    fonte: "Seed offline TEC/TIPI/PIS-COFINS — fontes oficiais MDIC + RFB",
    geradoEm: new Date().toISOString(),
    arquivosFonte: metaArquivos.map((a) => ({
      arquivo: a.path.replace(/\\/g, "/").split("tools/")[1] ?? a.path,
      baixadoEm: a.baixadoEm,
      url: a.url,
    })),
    pisPadrao: pisCfg.pisPadrao,
    cofinsPadrao: pisCfg.cofinsPadrao,
    fundamentoPisCofinsPadrao: pisCfg.fundamentoPadrao,
    cobertura: {
      ii: { encontrados: iiFound, total: ncms.length, percentual: pctII },
      ipi: { encontrados: ipiFound, total: ncms.length, percentual: pctIPI },
    },
    itens,
  };

  writeFileSync(OUT, JSON.stringify(out));
  console.log(`\nOK — ${Object.keys(itens).length} entradas → ${OUT}`);

  if (divergencias.length) {
    console.log("\n=== DIVERGÊNCIAS vs seed antigo (prevalece planilha oficial) ===");
    for (const d of divergencias) {
      console.log(
        `  ${d.ncm} ${d.campo}: antigo=${d.antigo} → novo=${d.novo} (${d.fonte.slice(0, 60)}…)`,
      );
    }
  } else {
    console.log("\nNenhuma divergência vs seed antigo (11 NCMs).");
  }

  return { out, divergencias, pctII, pctIPI };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
