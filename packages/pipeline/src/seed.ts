/** Carrega o seed ComexStat do JSON (para semear o banco ou rodar testes). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ComexSeed } from "./benchmark.js";

/** Caminho padrão do JSON de seed (resolve tanto a partir de src quanto de dist). */
export function defaultSeedPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "data", "comexstat-china-2023s1.json");
}

export function loadComexSeed(path = defaultSeedPath()): ComexSeed {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as ComexSeed;
}
