#!/usr/bin/env node
/**
 * Gate pré-deploy — bloqueia deploy VPS se testes gabarito falharem.
 * Uso: node tools/gate-pre-deploy.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tests = [
  "apps/api/test/gate-cotacao-72-gabarito.test.ts",
  "apps/api/test/gate-cotacao-72-traducao-pt.test.ts",
  "apps/api/test/gate-fatura-92-layout-china.test.ts",
  "apps/api/test/gate-fatura-92-planilha-cliente.test.ts",
  "apps/api/test/ncm-embarque.test.ts",
];

const pipelineTests = [
  "test/traducao-pt.test.ts",
  "test/planilha-cliente-ncm.test.ts",
  "test/resolve-ncm-gemini.test.ts",
  "test/planilha-china-ncm.test.ts",
  "test/parser-fatura92-layout-china.test.ts",
  "test/relatorio-fob-fonte.test.ts",
];

console.log("[gate-pre-deploy] Rodando gates obrigatórios...\n");

const buildShared = spawnSync("npm", ["run", "build", "-w", "@cia/shared"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (buildShared.status !== 0) {
  console.error("\n[gate-pre-deploy] FALHOU: build @cia/shared");
  process.exit(1);
}

const build = spawnSync("npm", ["run", "build", "-w", "@cia/pipeline"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (build.status !== 0) {
  console.error("\n[gate-pre-deploy] FALHOU: build @cia/pipeline");
  process.exit(1);
}

for (const rel of tests) {
  console.log(`→ ${rel}`);
  const r = spawnSync(
    "npx",
    ["vitest", "run", rel.replace("apps/api/", ""), "--config", "vitest.config.ts"],
    { cwd: join(root, "apps/api"), stdio: "inherit", shell: true },
  );
  if (r.status !== 0) {
    console.error(`\n[gate-pre-deploy] FALHOU: ${rel}`);
    process.exit(1);
  }
}

console.log("\n→ pipeline (NCM + conciliação)");
for (const rel of pipelineTests) {
  console.log(`→ ${rel}`);
  const r = spawnSync("npx", ["vitest", "run", rel], {
    cwd: join(root, "packages/pipeline"),
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.error(`\n[gate-pre-deploy] FALHOU: ${rel}`);
    process.exit(1);
  }
}

console.log("\n[gate-pre-deploy] VERDE — deploy VPS liberado (quando autorizado).");
process.exit(0);
