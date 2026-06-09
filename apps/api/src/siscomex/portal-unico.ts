/**
 * Adapter Portal Único Siscomex — autenticação mTLS + consultas ao vivo.
 *
 * CLSF: validação NCM (tabela vigente, refresh público + cache)
 * TTCE: alíquotas II/IPI/PIS/COFINS por NCM + país origem
 *
 * Docs: https://docs.portalunico.siscomex.gov.br/api/clsf/
 *       https://docs.portalunico.siscomex.gov.br/api/ttce/
 */

import { loadNcmVigente, type NcmCatalog, criarNcmCatalog } from "@cia/pipeline";
import { autenticarPortalUnico } from "./auth.js";
import { portalFetchJson } from "./http.js";
import { baseUrlPortalUnico, lerConfigSiscomex } from "./config.js";
import { extrairAliquotasTtce, type TtceRespostaImportacao } from "./ttce-parser.js";
import type {
  NcmClassificacaoOficial,
  NcmTratamentoTributario,
  SiscomexProvider,
} from "./types.js";

const NCM_PUBLIC_URL =
  "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO";

function normNcm(ncm: string): string {
  return ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

function codigoPaisChina(): number {
  const raw = process.env.SISCOMEX_CODIGO_PAIS ?? "160";
  return Number(raw) || 160;
}

let catalogoLive: NcmCatalog | null = null;
let catalogoLiveEm: number | null = null;
const CATALOGO_TTL_MS = 12 * 60 * 60_000;

async function catalogoVigente(): Promise<NcmCatalog> {
  const now = Date.now();
  if (catalogoLive && catalogoLiveEm && now - catalogoLiveEm < CATALOGO_TTL_MS) {
    return catalogoLive;
  }
  try {
    const res = await fetch(NCM_PUBLIC_URL);
    if (res.ok) {
      const raw = (await res.json()) as {
        Nomenclaturas?: Array<{ Codigo?: string; Descricao?: string }>;
        Data_Ultima_Atualizacao_NCM?: string;
      };
      const itens: Record<string, string> = {};
      for (const row of raw.Nomenclaturas ?? []) {
        const codigo = String(row.Codigo ?? "").replace(/\D/g, "");
        if (codigo.length === 8) itens[codigo] = String(row.Descricao ?? "").trim();
      }
      catalogoLive = criarNcmCatalog({
        fonte: "Portal Único Siscomex — Classif (ao vivo)",
        dataUltimaAtualizacao: raw.Data_Ultima_Atualizacao_NCM ?? null,
        total: Object.keys(itens).length,
        itens,
      });
      catalogoLiveEm = now;
      return catalogoLive;
    }
  } catch {
    /* fallback cache local */
  }
  return criarNcmCatalog(loadNcmVigente());
}

/** Consulta CLSF — NCM vigente na Receita (tabela ao vivo). */
async function fetchClassificacao(ncm: string): Promise<NcmClassificacaoOficial> {
  await autenticarPortalUnico();
  const key = normNcm(ncm);
  const cat = await catalogoVigente();
  const descricao = cat.descricao(key);
  const ativo = cat.existe(key);
  return {
    ncm: key,
    descricao,
    ativo,
    fonte: "portal-unico-clsf",
    dataConsulta: new Date().toISOString(),
    avisos: ativo ? [] : [`NCM ${key} não consta na tabela vigente Siscomex.`],
  };
}

/** Consulta TTCE — tratamento tributário importação (China default). */
async function fetchTratamentoTributario(ncm: string, dataRef?: string): Promise<NcmTratamentoTributario> {
  const key = normNcm(ncm);
  const hoje = new Date().toISOString().slice(0, 10);
  const body = {
    ncm: key,
    codigoPais: codigoPaisChina(),
    tipoOperacao: "I",
    dataFatoGerador: dataRef?.slice(0, 10) ?? hoje,
  };

  const res = await portalFetchJson<TtceRespostaImportacao>(
    "/ttce/api/ext/tratamentos-tributarios/importacao/",
    { method: "POST", body },
  );

  const { ii, ipi, pis, cofins, avisos } = extrairAliquotasTtce(res);

  return {
    ncm: key,
    aliquotaII: ii,
    aliquotaIPI: ipi,
    aliquotaPIS: pis,
    aliquotaCOFINS: cofins,
    fonte: "portal-unico-ttce",
    dataConsulta: new Date().toISOString(),
    avisos,
  };
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
              ? "Certificado detectado — defina SISCOMEX_ATIVO=true."
              : "Configure SISCOMEX_CERT_PATH na VPS.",
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
          aliquotaPIS: null,
          aliquotaCOFINS: null,
          fonte: "indisponivel",
          dataConsulta: null,
          avisos: [
            config.configurado
              ? "Certificado detectado — defina SISCOMEX_ATIVO=true."
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
          aliquotaPIS: null,
          aliquotaCOFINS: null,
          fonte: "indisponivel",
          dataConsulta: null,
          avisos: [msg],
        };
      }
    },
    async testarConexao() {
      if (!config.configurado) {
        return { ok: false, mensagem: "Certificado/chaves não configurados.", ambiente: config.ambiente };
      }
      try {
        await autenticarPortalUnico(true);
        const base = baseUrlPortalUnico(config.ambiente);
        const cat = await catalogoVigente();
        return {
          ok: true,
          mensagem: `Autenticado — ${cat.total} NCMs vigentes (${base}).`,
          ambiente: config.ambiente,
        };
      } catch (e) {
        return {
          ok: false,
          mensagem: e instanceof Error ? e.message : "Falha na autenticação.",
          ambiente: config.ambiente,
        };
      }
    },
  };
}

/** Invalida cache de NCM ao vivo (após atualização manual). */
export function invalidarCatalogoLive(): void {
  catalogoLive = null;
  catalogoLiveEm = null;
}
