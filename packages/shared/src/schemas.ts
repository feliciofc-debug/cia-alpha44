import { z } from "zod";
import { CANAIS, FONTES_BENCHMARK } from "./canal.js";

/** NCM em qualquer formato; normalizado para 8 dígitos sem pontuação. */
export const ncmSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length === 8, { message: "NCM deve ter 8 dígitos" });

/** NCM formatado para exibição: 0000.00.00 */
export function formatNcm(ncm: string): string {
  const d = ncm.replace(/\D/g, "").padStart(8, "0");
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

export const aliquotasSchema = z.object({
  ii: z.number().min(0).max(1),
  ipi: z.number().min(0).max(1),
  pis: z.number().min(0).max(1),
  cofins: z.number().min(0).max(1),
  icmsEntrada: z.number().min(0).max(1).default(0),
});
export type Aliquotas = z.infer<typeof aliquotasSchema>;

/** Candidato de NCM sugerido pela LLM, com confiança. */
export const ncmCandidatoSchema = z.object({
  ncm: z.string(),
  descricaoOficial: z.string().optional(),
  confianca: z.number().min(0).max(1),
});
export type NcmCandidato = z.infer<typeof ncmCandidatoSchema>;

/** Faixa de benchmark FOB/KG (US$/kg). */
export const benchmarkSchema = z.object({
  fonte: z.enum(FONTES_BENCHMARK),
  /** Primária: média simples por DI (col 3 planilha). */
  fobKgMedioDI: z.number().nullable().optional(),
  /** Secundária: média ponderada FOB/KG (col 4 / API). */
  fobKgPonderado: z.number().nullable().optional(),
  /** Alias legado — espelha fobKgMedioDI quando presente. */
  mediaFobKg: z.number().nullable(),
  /** Piso defensável — calculado só sobre fobKgMedioDI. */
  pisoDefensavel: z.number().nullable(),
  /** Teto observado. */
  teto: z.number().nullable(),
  /** Tamanho da amostra (genérico). */
  amostra: z.number().int().nonnegative().default(0),
  /** Nº de DIs na planilha mensal (quando houver). */
  amostraDIs: z.number().int().nonnegative().optional(),
  /** Texto curto explicando a base usada. */
  nota: z.string(),
  /** Rastro auditável — ex.: planilha-mensal(2023-S1):media-DI */
  rastroFonte: z.string().optional(),
  /** Aviso quando só houver métrica ponderada. */
  avisoBenchmark: z.string().optional(),
});
export type Benchmark = z.infer<typeof benchmarkSchema>;

/** Resultado da calibragem de FOB/KG (regras 6–7). */
export const calibracaoSchema = z.object({
  fobKgOriginal: z.number().nullable(),
  fobKgCalibrado: z.number(),
  /** % de desvio do FOB/KG calibrado vs média do benchmark. */
  desvioBenchmarkPct: z.number().nullable(),
  ajustado: z.boolean(),
  justificativa: z.string(),
});
export type Calibracao = z.infer<typeof calibracaoSchema>;

/** Análise de risco / canal por item. */
export const riscoSchema = z.object({
  canal: z.enum(CANAIS),
  /** Score 0–100 (maior = mais risco). */
  score: z.number().min(0).max(100),
  justificativa: z.string(),
  flags: z.array(z.string()).default([]),
});
export type Risco = z.infer<typeof riscoSchema>;

/** Item da cotação (modelo de domínio completo). */
export const itemSchema = z.object({
  id: z.string().optional(),
  descOriginal: z.string(),
  descPt: z.string().default(""),
  descDuimp: z.string().default(""),
  /** Uso / aplicação (用途) — herdado da planilha para regras FOB/NCM. */
  uso: z.string().optional(),
  /** Material (材质) — coluna fornecedor. */
  material: z.string().optional(),
  /** Confiança do NCM final escolhido (2-passes), não necessariamente candidatos[0]. */
  ncmConfianca: z.number().min(0).max(1).optional(),
  ncm: z.string(),
  ncmCandidatos: z.array(ncmCandidatoSchema).default([]),
  pesoBrutoKg: z.number().nonnegative().nullable().default(null),
  pesoLiqKg: z.number().nonnegative(),
  qtd: z.number().nonnegative().nullable().default(null),
  fobUnitarioUS: z.number().nonnegative().nullable().default(null),
  fobTotalUS: z.number().nonnegative(),
  aliquotas: aliquotasSchema,
  aliquotasOverride: z.boolean().default(false),
  benchmark: benchmarkSchema.optional(),
  calibracao: calibracaoSchema.optional(),
  risco: riscoSchema.optional(),
  anuencia: z.array(z.string()).default([]),
  antidumping: z.boolean().default(false),
  /** Foto do produto (compliance) — base64 durante sessão ou após parse. */
  fotoBase64: z.string().optional(),
  fotoMime: z.string().optional(),
  /** Caminho relativo em data/fotos/ após salvar cotação. */
  fotoPath: z.string().optional(),
  /** URL da API para exibir foto salva (preenchido pelo backend). */
  fotoUrl: z.string().optional(),
  /** NCM validado na tabela vigente Siscomex (Classif). */
  ncmValido: z.boolean().optional(),
  ncmFonte: z.enum(["planilha", "ia", "siscomex", "pendente"]).optional(),
  ncmPlanilhaOriginal: z.string().optional(),
  ncmDescricaoOficial: z.string().optional(),
  ncmAvisos: z.array(z.string()).optional(),
  /** Compatibilidade semântica produto × NCM (T5 — independente de ncmValido Siscomex). */
  compatibilidadeProduto: z.enum(["compativel", "incompativel", "revisar"]).optional(),
  motivoCompatibilidade: z.string().optional(),
  /** Revisão humana do NCM — destrava PDF mantendo o código. */
  ncmRevisadoHumano: z.boolean().optional(),
  ncmRevisadoEm: z.string().optional(),
  /** NCM vigente no momento da confirmação (invalida se o item mudar). */
  ncmConfirmado: z.string().optional(),
  ncmConfirmadoPor: z.string().optional(),
  /** Rastro FOB/kg (T6). */
  fobKgFonte: z.string().optional(),
  fobPendente: z.boolean().optional(),
  fobKgBase: z.enum(["bruto", "liquido", "indeterminado"]).optional(),
  fobKgAvisos: z.array(z.string()).optional(),
  /** Rastro auditável por tributo (II/IPI/PIS/COFINS) — T7. */
  aliquotasRastro: z
    .object({
      ii: z
        .object({
          valor: z.number(),
          origem: z.enum(["ttce", "tec-cache", "manual", "legado"]),
          fonte: z.string(),
          consultadoEm: z.string(),
          valorOriginal: z.number().optional(),
          origemOriginal: z.enum(["ttce", "tec-cache", "manual", "legado"]).optional(),
          fonteOriginal: z.string().optional(),
          consultadoEmOriginal: z.string().optional(),
          editadoEm: z.string().optional(),
          editadoPor: z.string().optional(),
        })
        .optional(),
      ipi: z
        .object({
          valor: z.number(),
          origem: z.enum(["ttce", "tec-cache", "manual", "legado"]),
          fonte: z.string(),
          consultadoEm: z.string(),
          valorOriginal: z.number().optional(),
          origemOriginal: z.enum(["ttce", "tec-cache", "manual", "legado"]).optional(),
          fonteOriginal: z.string().optional(),
          consultadoEmOriginal: z.string().optional(),
          editadoEm: z.string().optional(),
          editadoPor: z.string().optional(),
        })
        .optional(),
      pis: z
        .object({
          valor: z.number(),
          origem: z.enum(["ttce", "tec-cache", "manual", "legado"]),
          fonte: z.string(),
          consultadoEm: z.string(),
          valorOriginal: z.number().optional(),
          origemOriginal: z.enum(["ttce", "tec-cache", "manual", "legado"]).optional(),
          fonteOriginal: z.string().optional(),
          consultadoEmOriginal: z.string().optional(),
          editadoEm: z.string().optional(),
          editadoPor: z.string().optional(),
        })
        .optional(),
      cofins: z
        .object({
          valor: z.number(),
          origem: z.enum(["ttce", "tec-cache", "manual", "legado"]),
          fonte: z.string(),
          consultadoEm: z.string(),
          valorOriginal: z.number().optional(),
          origemOriginal: z.enum(["ttce", "tec-cache", "manual", "legado"]).optional(),
          fonteOriginal: z.string().optional(),
          consultadoEmOriginal: z.string().optional(),
          editadoEm: z.string().optional(),
          editadoPor: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type Item = z.infer<typeof itemSchema>;

export const despesaSchema = z.object({
  nome: z.string(),
  valorBRL: z.number(),
  entraBaseSaida: z.boolean().default(true),
  entraBaseNota: z.boolean().default(true),
});
export type Despesa = z.infer<typeof despesaSchema>;

export const paramsSaidaSchema = z.object({
  markupPct: z.number().min(0).default(0.06),
  pisSaida: z.number().min(0).default(0.0165),
  cofinsSaida: z.number().min(0).default(0.076),
  icmsSaida: z.number().min(0).default(0.04),
  csllSobreMarkup: z.number().min(0).default(0.09),
  irrfAliq: z.number().min(0).default(0.25),
  irrfBaseNotaPct: z.number().min(0).default(0.027),
  ipiTetoAliqMedia: z.number().min(0).default(0.15),
  icmsEntrada: z.number().min(0).default(0),
});
export type ParamsSaida = z.infer<typeof paramsSaidaSchema>;

/** Benefícios fiscais suportados na formação de preço (v1). */
export const BENEFICIOS_FISCAIS = ["ALAGOAS", "NENHUM"] as const;
export type BeneficioFiscal = (typeof BENEFICIOS_FISCAIS)[number];

export const regimeIcmsSchema = z.enum(["AL_DIFERIDO", "NORMAL"]);
export type RegimeIcmsPersistido = z.infer<typeof regimeIcmsSchema>;

export const cotacaoSchema = z.object({
  id: z.string().optional(),
  /** Importadora / empresa trade (quem opera a importação). */
  empresaTrade: z.string().default(""),
  /** Cliente final do orçamento. */
  cliente: z.string().default(""),
  benefFiscal: z.string().default("ALAGOAS"),
  moeda: z.string().default("US$"),
  cambio: z.number().positive(),
  freteTotalUS: z.number().nonnegative(),
  adicionaisVaUS: z.number().nonnegative().default(0),
  reducaoBaseUS: z.number().nonnegative().default(0),
  siscomex: z.number().nonnegative().default(0),
  antidumpingBRL: z.number().nonnegative().default(0),
  incoterm: z.string().default("CFR"),
  origem: z.string().default("RJ"),
  destino: z.string().default("SP"),
  /** UF do estabelecimento vendedor (P2.2). */
  ufEmpresa: z.string().default("AL"),
  /** Regime ICMS entrada/desembaraço (P2.2). */
  regimeIcms: regimeIcmsSchema.default("AL_DIFERIDO"),
  /** true = icmsSaida em params foi fixado manualmente ou legado divergente. */
  icmsSaidaManualFlag: z.boolean().default(false),
  /** Avisos fiscais persistidos (ex.: legado ICMS). */
  avisosFiscais: z.array(z.string()).default([]),
  itens: z.array(itemSchema),
  despesas: z.array(despesaSchema),
  /** Número de containers — despesas locais são escaladas por este fator (default planilha 66). */
  qtdContainers: z.number().int().positive().optional(),
  outrasDespesasBaseBRL: z.number().nonnegative().optional(),
  params: paramsSaidaSchema,
  criadoEm: z.string().optional(),
});
export type Cotacao = z.infer<typeof cotacaoSchema>;

export { DESPESAS_POR_CONTAINER, DESPESAS_PADRAO, despesasParaContainers, despesasComDefaults, despesasSemValor, outrasDespesasBaseParaContainers } from "./despesas.js";
