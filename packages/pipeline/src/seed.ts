/** Carrega o seed ComexStat do JSON (para semear o banco ou rodar testes). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ComexSeed } from "./benchmark.js";
import type { TecCache } from "./tec.js";
import type { NcmVigenteCache } from "./ncm-catalog.js";

/** Caminho padrão do JSON de seed (resolve tanto a partir de src quanto de dist). */
export function defaultSeedPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "data", "comexstat-china-2023s1.json");
}

export function loadComexSeed(path = defaultSeedPath()): ComexSeed {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as ComexSeed;
}

export function tecCachePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "data", "tec-cache.json");
}

export function loadTecCache(path = tecCachePath()): TecCache {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as TecCache;
}

export function ncmVigenteDataPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "data", "ncm-vigente.json");
}

export function loadNcmVigenteCache(path = ncmVigenteDataPath()): NcmVigenteCache {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as NcmVigenteCache;
}
