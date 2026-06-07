/**
 * Adapter Portal Único Siscomex (CLSF + TTCE).
 *
 * Estrutura pronta para autenticação e consultas ao vivo.
 * HTTP real só roda com SISCOMEX_ATIVO=true — até lá, retorna aviso sem quebrar o fluxo.
 *
 * Docs: https://docs.portalunico.siscomex.gov.br/api/clsf/
 *       https://docs.portalunico.siscomex.gov.br/api/ttce/
 */

import { baseUrlPortalUnico, lerConfigSiscomex } from "./config.js";
import type {
  NcmClassificacaoOficial,
  NcmTratamentoTributario,
  SiscomexProvider,
} from "./types.js";

function normNcm(ncm: string): string {
  return ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

/**
 * Autenticação SSL + JWT/CSRF — implementar quando certificado A1 estiver na VPS.
 * @see https://api-docs.portalunico.siscomex.gov.br/introducao-api-publica/
 */
async function autenticarPortalUnico(_config: ReturnType<typeof lerConfigSiscomex>): Promise<{
  authorization: string;
  csrfToken: string;
}> {
  // TODO: mTLS com SISCOMEX_CERT_PATH ou chaves de acesso (SISCOMEX_CLIENT_ID/SECRET)
  throw new Error("Autenticação Portal Único pendente de homologação com certificado.");
}

/** Consulta CLSF — endpoint a confirmar na doc oficial por ambiente. */
async function fetchClassificacao(_ncm: string): Promise<NcmClassificacaoOficial> {
  const config = lerConfigSiscomex();
  const _base = baseUrlPortalUnico(config.ambiente);
  await autenticarPortalUnico(config);
  // TODO: GET ${base}/.../clsf/... após homologação
  throw new Error("Consulta CLSF não implementada.");
}

/** Consulta TTCE — alíquotas oficiais na data de referência. */
async function fetchTratamentoTributario(_ncm: string, _dataRef?: string): Promise<NcmTratamentoTributario> {
  const config = lerConfigSiscomex();
  const _base = baseUrlPortalUnico(config.ambiente);
  await autenticarPortalUnico(config);
  // TODO: POST ${base}/ttce/api/... após homologação
  throw new Error("Consulta TTCE não implementada.");
}

export function criarPortalUnicoProvider(): SiscomexProvider {
  const config = lerConfigSiscomex();
  const operacional = config.ativo;

  return {
    nome: `portal-unico (${config.ambiente})`,
    configurado: config.configurado,
    operacional,
    config,
    async consultarClassificacao(ncm) {
      const key = normNcm(ncm);
      if (!operacional) {
        return {
          ncm: key,
          descricao: null,
          ativo: false,
          fonte: "indisponivel",
          dataConsulta: null,
          avisos: [
            config.configurado
              ? "Certificado/chaves detectados — defina SISCOMEX_ATIVO=true após homologação."
              : "Configure SISCOMEX_CERT_PATH ou SISCOMEX_CLIENT_ID na VPS.",
          ],
        };
      }
      try {
        return await fetchClassificacao(key);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha na consulta CLSF.";
        return {
          ncm: key,
          descricao: null,
          ativo: false,
          fonte: "indisponivel",
          dataConsulta: null,
          avisos: [msg],
        };
      }
    },
    async consultarTratamentoTributario(ncm, dataRef) {
      const key = normNcm(ncm);
      if (!operacional) {
        return {
          ncm: key,
          aliquotaII: null,
          aliquotaIPI: null,
          fonte: "indisponivel",
          dataConsulta: null,
          avisos: [
            config.configurado
              ? "Certificado/chaves detectados — defina SISCOMEX_ATIVO=true após homologação."
              : "Configure credenciais Siscomex na VPS.",
          ],
        };
      }
      try {
        return await fetchTratamentoTributario(key, dataRef);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Falha na consulta TTCE.";
        return {
          ncm: key,
          aliquotaII: null,
          aliquotaIPI: null,
          fonte: "indisponivel",
          dataConsulta: null,
          avisos: [msg],
        };
      }
    },
  };
}
