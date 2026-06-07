/** Lê variáveis de ambiente do Portal Único — desligado por padrão. */

import type { SiscomexAmbiente, SiscomexConfig } from "./types.js";

function ambienteFromEnv(): SiscomexAmbiente {
  const raw = (process.env.SISCOMEX_AMBIENTE ?? "validacao").toLowerCase();
  if (raw === "producao" || raw === "production") return "producao";
  if (raw === "homologacao" || raw === "homolog") return "homologacao";
  return "validacao";
}

export function lerConfigSiscomex(): SiscomexConfig {
  const certPath = process.env.SISCOMEX_CERT_PATH?.trim();
  const certPass = process.env.SISCOMEX_CERT_PASSWORD?.trim();
  const clientId = process.env.SISCOMEX_CLIENT_ID?.trim();
  const clientSecret = process.env.SISCOMEX_CLIENT_SECRET?.trim();

  const temCert = Boolean(certPath && certPass);
  const temChaves = Boolean(clientId && clientSecret);
  const configurado = temCert || temChaves;
  const ativo = configurado && process.env.SISCOMEX_ATIVO === "true";

  return {
    configurado,
    ativo,
    ambiente: ambienteFromEnv(),
    modoAuth: temCert ? "certificado" : temChaves ? "chaves" : "nenhum",
  };
}

export function baseUrlPortalUnico(ambiente: SiscomexAmbiente): string {
  switch (ambiente) {
    case "producao":
      return "https://portalunico.siscomex.gov.br";
    case "homologacao":
      return "https://hom.pucomex.serpro.gov.br";
    default:
      return "https://val.portalunico.siscomex.gov.br";
  }
}
