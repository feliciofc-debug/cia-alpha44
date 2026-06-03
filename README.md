# CIA / Alpha 44 — Sistema de Cotação de Importação (SaaS)

Upload da planilha do fornecedor → tradução + classificação NCM → nacionalização
completa (engine fiscal CIA/Alpha 44) → calibragem FOB/KG vs benchmark →
análise de risco de canal → orçamento (tela + Excel + PDF) em segundos.

## Estrutura (monorepo npm workspaces)

```
cia-alpha44/
├─ packages/
│  └─ fiscal-engine/     # motor fiscal puro (entrada + saída), validado contra a planilha 66
├─ apps/
│  ├─ api/               # backend Fastify + Prisma (a construir)
│  └─ web/               # frontend React + Vite + Tailwind + shadcn (a construir)
└─ tools/                # scripts de inspeção das planilhas-fonte
```

## Stack

React + TS + Vite · Tailwind + shadcn/ui · Zustand + TanStack Query/Table ·
Fastify + TS · Prisma + PostgreSQL (Neon) · SheetJS · ExcelJS · Puppeteer · Anthropic API.

## Engine fiscal (`@cia/fiscal-engine`)

Decodificado **célula a célula** da planilha-mãe (`66 - - 13-03-2026.xlsx`) e
validado número por número (`npm run engine:test` → 9/9).

### Cascata de ENTRADA (nacionalização)
```
frete_kg     = (adicionaisVA + freteTotal) / pesoLiqTotal
CIF/kg_item  = FOB_item/peso + frete_kg
II           = aliqII  * CIF_item_US * câmbio
IPI          = aliqIPI * (CIF_item_BRL + II)
PIS          = aliqPIS * CIF_item_BRL
COFINS       = aliqCOFINS * CIF_item_BRL
```
ICMS de entrada **não** compõe a nacionalização (diferido em Alagoas).

### Cascata de SAÍDA (formação de preço)
```
markup        = (CIF_BRL + impostosEntrada + outrasDespesasBase) * markup%
base_saida    = CIF_BRL + impostosEntrada + outrasDespesasBase + markup
venda_liquida = base_saida / (1 - PIS_s - COFINS_s - ICMS_s)     // /0,8675
ICMS_saida    = (venda_liquida / (1-ICMS_s)) * ICMS_s - ICMS_entrada
DIF_PIS       = (venda_liquida - ICMS_saida) * 1,65% - PIS_entrada
DIF_COFINS    = (venda_liquida - ICMS_saida) * 7,6%  - COFINS_entrada
DIF_IPI       = aliq_media_IPI * base_saida - IPI_entrada
CSLL          = markup * 9%
IRRF          = (markup + base_nota * 2,7%) * 25%
```

> **Honestidade (regra 8):** a planilha-fonte usa dois valores de Siscomex
> (154,23 na base de impostos e 153,24 no total). O motor usa um único Siscomex
> consistente; por isso o total do motor difere em exatos R$ 0,99 do total da
> planilha — diferença que é a própria inconsistência da fonte.

## Comandos

```bash
npm install            # instala todo o workspace
npm run engine:test    # roda os testes do motor fiscal
npm run build          # build de todos os pacotes
```

## Decisões de produto

| Item | Decisão |
|---|---|
| Alíquotas TEC/TIPI | tabela cacheada + override manual (adapter pronto p/ Classif TT) |
| Despesas operacionais | tabela editável por cotação |
| Margem/markup | input por cotação, **default 6%** |
| Banco | Postgres gerenciado (Neon) |
| Backend | Fastify |
