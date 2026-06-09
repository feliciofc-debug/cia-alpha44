/** Contrato do provedor Portal Único Siscomex (CLSF + TTCE). */

export type SiscomexAmbiente = "validacao" | "homologacao" | "producao";

export interface SiscomexConfig {
  /** Credenciais detectadas (certificado ou chaves de acesso). */
  configurado: boolean;
  /** Chamadas HTTP ao Portal Único habilitadas (SISCOMEX_ATIVO=true). */
  ativo: boolean;
  ambiente: SiscomexAmbiente;
  modoAuth: "certificado" | "chaves" | "nenhum";
}

export interface NcmClassificacaoOficial {
  ncm: string;
  descricao: string | null;
  ativo: boolean;
  fonte: "portal-unico-clsf" | "indisponivel";
  dataConsulta: string | null;
  avisos: string[];
}

export interface NcmTratamentoTributario {
  ncm: string;
  aliquotaII: number | null;
  aliquotaIPI: number | null;
  aliquotaPIS?: number | null;
  aliquotaCOFINS?: number | null;
  fonte: "portal-unico-ttce" | "indisponivel";
  dataConsulta: string | null;
  avisos: string[];
}

export type StatusConferenciaNcm = "confere" | "diverge" | "so_planilha" | "so_ia" | "pendente_siscomex";

export interface ItemConferenciaNcm {
  indice: number;
  ncmPlanilha: string | null;
  ncmIa: string | null;
  ncmSiscomex: string | null;
  status: StatusConferenciaNcm;
  descricaoSiscomex: string | null;
  avisos: string[];
}

export interface SiscomexProvider {
  nome: string;
  /** Credenciais presentes no ambiente. */
  configurado: boolean;
  /** Integração HTTP ligada (SISCOMEX_ATIVO). */
  operacional: boolean;
  config: SiscomexConfig;
  /** Consulta classificação fiscal (CLSF) — no-op até certificado + SISCOMEX_ATIVO. */
  consultarClassificacao(ncm: string): Promise<NcmClassificacaoOficial>;
  /** Consulta tratamento tributário (TTCE) — alíquotas ao vivo com certificado. */
  consultarTratamentoTributario(ncm: string, dataRef?: string): Promise<NcmTratamentoTributario>;
  /** Testa autenticação mTLS + JWT (opcional). */
  testarConexao?(): Promise<{ ok: boolean; mensagem: string; ambiente: string }>;
}
