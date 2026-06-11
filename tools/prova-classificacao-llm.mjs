#!/usr/bin/env npx tsx
/**
 * Prova de classificação NCM em 2 passes com LLM real.
 * OBRIGATÓRIO: npx tsx (fonte TypeScript — NÃO usa dist compilado).
 * Usa chaves do .env na raiz do monorepo. NUNCA imprime chaves de API.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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
const { executar2PassesComLlm } = await import(
  "../apps/api/src/llm/classificar-ncm-2passes.ts"
);
const {
  PROMPT_PASSE2_VERSION,
  PRODUTOS_PROVA_CLASSIFICACAO,
  SYSTEM_PASSE2,
} = await import("../apps/api/src/llm/prompt-2passes.ts");
const { criarChamadaAnthropic, criarChamadaOpenAi } = await import(
  "../apps/api/src/llm/llm-chamada.ts"
);

const PRODUTOS = [...PRODUTOS_PROVA_CLASSIFICACAO];
const PROMPT_HASH = createHash("sha256").update(SYSTEM_PASSE2).digest("hex").slice(0, 12);

function escolherChamadaLlm() {
  const escolha = (process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const openaiModel = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  if (escolha === "anthropic" && anthropicKey) {
    return { nome: `anthropic:${anthropicModel}`, fn: criarChamadaAnthropic(anthropicKey, anthropicModel) };
  }
  if (escolha === "openai" && openaiKey) {
    return { nome: `openai:${openaiModel}`, fn: criarChamadaOpenAi(openaiKey, openaiModel) };
  }
  if (escolha === "auto") {
    if (anthropicKey) {
      return { nome: `anthropic:${anthropicModel}`, fn: criarChamadaAnthropic(anthropicKey, anthropicModel) };
    }
    if (openaiKey) {
      return { nome: `openai:${openaiModel}`, fn: criarChamadaOpenAi(openaiKey, openaiModel) };
    }
  }
  return null;
}

// --- Auditoria de versão (sempre antes da chamada LLM) ---
console.log("=== PROVA CLASSIFICACAO 2 PASSES ===");
console.log(`Prompt versao: ${PROMPT_PASSE2_VERSION}`);
console.log(`Prompt hash:   ${PROMPT_HASH}`);
console.log("Codigo:        apps/api/src/llm/classificar-ncm-2passes.ts (fonte via tsx)");
console.log(`Produtos (${PRODUTOS.length}):`);
for (let i = 0; i < PRODUTOS.length; i++) {
  console.log(`  [${i}] ${PRODUTOS[i]}`);
}

if (!SYSTEM_PASSE2.includes("9401.31/39")) {
  console.error("\nERRO: SYSTEM_PASSE2 desatualizado — falta referencia 9401.31/39.");
  process.exit(3);
}

const cadeira = PRODUTOS[2] ?? "";
if (!cadeira.includes("de altura ajustável")) {
  console.error("\nERRO: descricao da cadeira desatualizada — falta 'de altura ajustavel'.");
  console.error(`  Atual: ${cadeira}`);
  process.exit(4);
}

const llm = escolherChamadaLlm();
if (!llm) {
  console.error("\nNenhuma chave LLM configurada. Defina ANTHROPIC_API_KEY ou OPENAI_API_KEY no .env.");
  process.exit(2);
}

console.log(`\nProvider: ${llm.nome}`);
console.log("Iniciando classificacao...\n");

const catalog = criarNcmCatalog(loadNcmVigente());
const inputs = PRODUTOS.map((descOriginal) => ({ descOriginal }));
const resultados = await executar2PassesComLlm(catalog, inputs, llm.fn);

for (let i = 0; i < PRODUTOS.length; i++) {
  const descEntrada = PRODUTOS[i];
  const r = resultados[i];
  console.log("---");
  console.log(`Produto (entrada): ${descEntrada}`);
  console.log(`Descricao PT (IA): ${r.descPt ?? "—"}`);
  console.log(`Posicao passe 1:   ${r.posicaoPasse1 ?? "—"}`);
  console.log(`NCM-8 final:       ${r.ncmCandidatos[0]?.ncm ?? "—"}`);
  console.log(`Confianca P1:      ${r.confiancaPasse1 ?? "—"}`);
  console.log(`Confianca P2:      ${r.confiancaPasse2 ?? r.ncmCandidatos[0]?.confianca ?? "—"}`);
  console.log(`Justificativa RGI: ${r.justificativaRGI ?? "—"}`);
  console.log(`Aviso material:    ${r.avisoMaterial ?? "—"}`);
  console.log(`Aviso atributo:    ${r.avisoAtributo ?? "—"}`);
  console.log(`Baixa confianca:   ${r.classificacaoBaixaConfianca ? "sim" : "nao"}`);
}

console.log(`\n=== FIM (${PROMPT_PASSE2_VERSION}) ===`);
