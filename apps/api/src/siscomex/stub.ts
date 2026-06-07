/** Provedor stub — padrão quando certificado/chaves não estão configurados. */

import { lerConfigSiscomex } from "./config.js";
import type { NcmClassificacaoOficial, NcmTratamentoTributario, SiscomexProvider } from "./types.js";

function ncmIndisponivel(ncm: string): NcmClassificacaoOficial {
  return {
    ncm: ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8),
    descricao: null,
    ativo: false,
    fonte: "indisponivel",
    dataConsulta: null,
    avisos: ["Portal Único não configurado — defina SISCOMEX_CERT_PATH ou SISCOMEX_CLIENT_ID."],
  };
}

export function criarStubSiscomexProvider(): SiscomexProvider {
  const config = lerConfigSiscomex();
  return {
    nome: "portal-unico (inativo)",
    configurado: false,
    operacional: false,
    config,
    async consultarClassificacao(ncm) {
      return ncmIndisponivel(ncm);
    },
    async consultarTratamentoTributario(ncm) {
      return {
        ncm: ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8),
        aliquotaII: null,
        aliquotaIPI: null,
        fonte: "indisponivel",
        dataConsulta: null,
        avisos: ["Portal Único não configurado."],
      };
    },
  };
}
