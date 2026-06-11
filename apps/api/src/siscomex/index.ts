/**
 * Siscomex plugável — Portal Único (CLSF + TTCE).
 * SISCOMEX_PROVIDER = portal-unico | stub | auto
 *
 * Desligado por padrão: não altera classificação/cálculo existentes.
 */

import { lerConfigSiscomex } from "./config.js";
import { criarPortalUnicoProvider } from "./portal-unico.js";
import { criarStubSiscomexProvider } from "./stub.js";

export * from "./types.js";
export * from "./config.js";
export * from "./conferencia.js";
export * from "./compatibilidade-produto.js";

export function escolherSiscomexProvider() {
  const escolha = (process.env.SISCOMEX_PROVIDER ?? "auto").toLowerCase();
  const config = lerConfigSiscomex();
  const stub = criarStubSiscomexProvider();

  if (escolha === "stub") return stub;
  if (escolha === "portal-unico") return criarPortalUnicoProvider();
  if (escolha === "auto") {
    if (config.configurado) return criarPortalUnicoProvider();
  }
  return stub;
}
