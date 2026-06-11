/**
 * Prova de classificação NCM em 2 passes com LLM real.
 * Usa chaves do ambiente (.env carregado pelo shell ou variáveis exportadas).
 * NUNCA imprime chaves de API.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadDotEnv();

const { criarNcmCatalog, loadNcmVigente } = await import("@cia/pipeline");
const { escolherProvider } = await import("../apps/api/src/llm/index.ts");

const PRODUTOS = [
  "Garrafa térmica inox 500ml isolamento vácuo",
  "Fone bluetooth TWS wireless earphone",
  "Cadeira escritório giratória altura ajustável",
];

const catalog = criarNcmCatalog(loadNcmVigente());
const provider = escolherProvider([]);

if (!provider.classify2Passes) {
  console.error("Provider não suporta classify2Passes.");
  process.exit(1);
}

console.log(`Provider: ${provider.nome} (disponivel=${provider.disponivel})`);

if (!provider.disponivel) {
  console.error(
    "Nenhuma chave LLM configurada. Defina ANTHROPIC_API_KEY ou OPENAI_API_KEY no .env.",
  );
  process.exit(2);
}

const resultados = await provider.classify2Passes(
  catalog,
  PRODUTOS.map((descOriginal) => ({ descOriginal })),
);

for (let i = 0; i < PRODUTOS.length; i++) {
  const desc = PRODUTOS[i];
  const r = resultados[i];
  console.log("\n---");
  console.log(`Produto: ${desc}`);
  console.log(`Posição passe 1: ${r.posicaoPasse1 ?? "—"}`);
  console.log(`NCM-8 final: ${r.ncmCandidatos[0]?.ncm ?? "—"}`);
  console.log(`Confiança P1: ${r.confiancaPasse1 ?? "—"}`);
  console.log(`Confiança P2: ${r.confiancaPasse2 ?? r.ncmCandidatos[0]?.confianca ?? "—"}`);
  console.log(`Justificativa RGI: ${r.justificativaRGI ?? "—"}`);
  console.log(`Baixa confiança: ${r.classificacaoBaixaConfianca ? "sim" : "não"}`);
}
