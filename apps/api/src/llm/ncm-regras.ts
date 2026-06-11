/**
 * Regras Gerais de Interpretação (RGI) e método de classificação NCM/SH.
 * Base: Nomenclatura Comum do Mercosul — Receita Federal / Siscomex Classif.
 */

/** RGIs aplicáveis na classificação de mercadorias (resumo operacional para IA). */
export const RGI_RESUMO = `
REGRAS GERAIS DE INTERPRETAÇÃO (RGI) — aplicar nesta ordem quando relevante:

RGI 1 — Os títulos das Seções, Capítulos e Subcapítulos têm valor legal apenas para referência.
  A classificação é determinada legalmente pelos textos das posições e subposições e pelas Notas de Seção/Capítulo.

RGI 2 — (a) Artigos incompletos ou inacabados com caráter essencial da mercadoria completa classificam-se como completos.
  (b) Misturas e combinações seguem as Notas pertinentes.

RGI 3 — Quando mais de um código puder aplicar:
  (a) preferir o mais específico;
  (b) se empate, preferir o que confere caráter essencial;
  (c) se persistir, preferir o último na ordem numérica.

RGI 4 — Mercadoria semelhante à de outra posição classifica-se junto com ela se a posição não incluir referência a material específico.

RGI 5 — Estojos e embalagens especialmente adaptados classificam-se com a mercadoria (salvo Notas).

RGI 6 — Subposições do mesmo nível comparadas entre si; aplicar RGI 1–5 no nível da subposição.

CAPÍTULO 9405 (Iluminação) — orientação:
- Lustres/luminárias elétricas de teto ou parede → preferir 9405.2x (ex.: 94052100 LED, 94051190 outros).
- Nunca classificar luminária como 2106 (extrato), 8480 (máquina) ou 940599 (partes) salvo ser claramente parte/acessório.
- NCM 94051093 está DESCONTINUADO — se aparecer na planilha, substituir por 94052100 ou 94051190 conforme LED/construção.
`.trim();

/** 87.08 (automóveis) vs 87.14 (motos/ciclos/patinetes) — partes e acessórios. */
export const REGRA_8708_8714 = `
CAPÍTULO 87 — PARTES DE VEÍCULOS (8708 vs 8714):
- Posição 87.08 é EXCLUSIVA para partes e acessórios de veículos das posições 87.01 a 87.05 (automóveis de passageiros, comerciais leves, caminhões etc.).
- Partes e acessórios de motocicletas (87.11), ciclomotores/auxiliares elétricos (87.12) e ciclos/patinetes/scooters elétricos (87.11–87.13) classificam-se na posição 87.14 — NÃO em 87.08.
- Amortecedores, freios, cabos, parafusos e demais acessórios fornecidos para patinete/scooter elétrico (87.11.60 etc.) → preferir 8714 (ex.: 8714.10 partes de motocicletas), nunca 8708.80 (suspensão de automóvel).
`.trim();

/** Nota 2 da Seção XVII — partes de uso geral vs partes de veículos. */
export const REGRA_NOTA2_SECAO_XVII = `
NOTA 2 DA SEÇÃO XVII (Veículos) — partes de uso geral:
- Parafusos, porcas, arruelas, molas e demais artigos de uso geral de metal (posição 73.18, 73.20 etc.) classificam-se NESTAS posições, mesmo quando destinados a veículos — NÃO em 87.08/87.14.
- Máquinas, aparelhos e material elétrico de uso geral (capítulos 84 e 85 — ex.: carregadores/adaptadores 85.04.40) classificam-se nos respectivos capítulos, mesmo quando de uso veicular — NÃO em 87.08/87.14.
- Posições 87.08 e 87.14 aplicam-se somente a partes e acessórios identificáveis como próprios de veículos (ex.: para-lamas, manetes, painéis integrados ao veículo), não a fixadores ou equipamentos elétricos de uso geral.
`.trim();

/** Passos que a IA deve seguir antes de escolher o NCM. */
export const METODO_CLASSIFICACAO = `
MÉTODO OBRIGATÓRIO (para cada item):
1. Identificar: material principal, função, uso, grau de elaboração, se elétrico/LED, se partes ou conjunto.
2. Determinar Capítulo/Posição pelos textos legais (não pelo nome comercial do fornecedor).
3. Aplicar RGI 1 e RGI 6 — escolher subposição de 8 dígitos mais específica.
4. Se houver "contextoSiscomex" com NCMs vigentes, escolher SOMENTE entre esses códigos.
5. Nunca inventar NCM — se incerto, retornar ncmCandidatos vazio e confiança baixa.
6. Se ncmInformado da planilha constar no contexto Siscomex e for coerente com o produto, priorizá-lo.
`.trim();

export function montarSystemPromptClassificacao(): string {
  return [
    "Você é especialista em classificação fiscal NCM/SH para importação brasileira (Receita Federal / Siscomex).",
    "Para cada item: traduza (descPt), gere descDuimp defensável, sugira 1–3 NCMs candidatos (8 dígitos).",
    RGI_RESUMO,
    METODO_CLASSIFICACAO,
    "Responda APENAS JSON válido, sem texto fora do JSON.",
  ].join("\n\n");
}
