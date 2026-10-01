/** Feature flags pagas por tenant, recarregadas de arquivo com falha fechada. */

import { readFile, stat } from "node:fs/promises";
import type { FastifyRequest } from "fastify";

const DEFAULT_FEATURES_PATH = "/etc/cia-alpha44/features.json";
const RECHECK_MS = 30_000;

type CacheFeatures = {
  path: string;
  checkedAt: number;
  mtimeMs: number | null;
  size: number | null;
  upgradeUpload: Set<string>;
};

let cache: CacheFeatures = {
  path: "",
  checkedAt: 0,
  mtimeMs: null,
  size: null,
  upgradeUpload: new Set(),
};
let refreshEmCurso: Promise<void> | null = null;
let ultimoAviso: string | null = null;

function featuresPath(): string {
  return process.env.CIA_FEATURES_PATH?.trim() || DEFAULT_FEATURES_PATH;
}

function parseFeatures(raw: string): Set<string> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("raiz deve ser objeto");
  }
  const upgradeUpload = (parsed as { upgradeUpload?: unknown }).upgradeUpload;
  if (!Array.isArray(upgradeUpload) || !upgradeUpload.every((slug) => typeof slug === "string")) {
    throw new Error("upgradeUpload deve ser array de strings");
  }
  return new Set(upgradeUpload);
}

async function recarregar(req: FastifyRequest, path: string, now: number): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("caminho não é arquivo");

    if (cache.path === path && cache.mtimeMs === info.mtimeMs && cache.size === info.size) {
      cache = { ...cache, checkedAt: now };
      return;
    }

    const upgradeUpload = parseFeatures(await readFile(path, "utf8"));
    cache = {
      path,
      checkedAt: now,
      mtimeMs: info.mtimeMs,
      size: info.size,
      upgradeUpload,
    };
    ultimoAviso = null;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    const assinatura = `${path}:${motivo}`;
    cache = {
      path,
      checkedAt: now,
      mtimeMs: null,
      size: null,
      upgradeUpload: new Set(),
    };
    if (ultimoAviso !== assinatura) {
      ultimoAviso = assinatura;
      req.log.warn({ path, motivo }, "[features] arquivo indisponível ou inválido; upgrades desligados");
    }
  }
}

/** Único ponto de decisão do upgrade: comparação exata com o slug autenticado. */
export async function upgradeUploadAtivo(req: FastifyRequest): Promise<boolean> {
  const path = featuresPath();
  const now = Date.now();
  if (cache.path !== path || now - cache.checkedAt >= RECHECK_MS) {
    refreshEmCurso ??= recarregar(req, path, now).finally(() => {
      refreshEmCurso = null;
    });
    await refreshEmCurso;
  }
  return cache.upgradeUpload.has(req.auth!.tenantSlug);
}

export function resetFeatureFlagsCacheParaTestes(): void {
  cache = {
    path: "",
    checkedAt: 0,
    mtimeMs: null,
    size: null,
    upgradeUpload: new Set(),
  };
  refreshEmCurso = null;
  ultimoAviso = null;
}
