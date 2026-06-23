# Diagnóstico — cot 72 / CI / NCM / tradução PT

**Data:** 2026-06-23  
**Escopo:** investigação apenas — **sem correções** de fiscal-engine nem hierarquia.  
**Branch:** `cursor/diagnostico-cot72-ci-ncm-48a6`

---

## 1) CI vermelho — `CI / test-and-build (pull_request)`

### Comando reproduzido (espelha `.github/workflows/ci.yml`)

```bash
npm ci
npm run engine:test    # ← falha aqui (~26s no GitHub)
npm run build:api
npm run build:web
```

### O que quebrou

| Etapa | Resultado |
|-------|-----------|
| `npm run engine:test` | **FAIL** |
| `npm run build:api` | OK (não chega a rodar no CI) |
| `npm run build:web` | OK (não chega a rodar no CI) |

**Suite que falha:** `packages/fiscal-engine/test/icms-resolver-gate.test.ts`  
**Motivo:** Vitest não resolve o pacote `@cia/shared` porque o `dist/` ainda não foi gerado.

### Saída completa do erro

```
 RUN  v2.1.9 /workspace/packages/fiscal-engine

 ❯ test/icms-resolver-gate.test.ts (0 test)
 ✓ test/fechamento-66.test.ts (5 tests)
 ✓ test/engine-66.test.ts (9 tests)
 ✓ test/alinhamento-paulo.test.ts (3 tests)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/icms-resolver-gate.test.ts
Error: Failed to resolve entry for package "@cia/shared". The package may have incorrect main/module/exports specified in its package.json.
  Plugin: vite:import-analysis
  File: /workspace/packages/fiscal-engine/test/icms-resolver-gate.test.ts
 ❯ packageEntryFailure ../../node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:46638:15
 ❯ resolvePackageEntry ../../node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:46635:3
 ...

 Test Files  1 failed | 3 passed (4)
      Tests  17 passed (17)
```

### Por quê

1. O teste P2.4 importa `aplicarIcmsCotacao` de `@cia/shared`:

```6:7:packages/fiscal-engine/test/icms-resolver-gate.test.ts
import { aplicarIcmsCotacao, FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL } from "@cia/shared";
import { calcCotacao, type CotacaoFiscalInput, type Despesa } from "../src/index.js";
```

2. `@cia/shared` expõe apenas `./dist/index.js` (`packages/shared/package.json:8-12`) — sem `dist`, o Vite falha na resolução.

3. O workflow CI roda `engine:test` **antes** de `build:api` (que compila `@cia/shared`):

```26:33:.github/workflows/ci.yml
      - name: Fiscal engine (selo planilha 66)
        run: npm run engine:test

      - name: Build API
        run: npm run build:api
```

4. **Confirmação:** após `npm run build -w @cia/shared`, o mesmo `engine:test` passa (25/25 testes, incluindo `icms-resolver-gate`).

**Conclusão:** regressão de ordem no CI desde o gate P2.4 (`af64ab0`). Não é falha de lógica fiscal — é dependência de build não satisfeita antes do Vitest.

---

## 2) Rótulo falso “NCM declarado na planilha do cliente” (84238900)

### Contexto confirmado

Planilha-fonte do contêiner 72 **não tem coluna NCM** (fornecedor, foto, REF, descrição, peças, qtd, peso bruto, volume). O parser emite aviso explícito quando a coluna não é detectada:

```627:632:packages/pipeline/src/parser.ts
  const colunaNcmDetectada = colunas.some((c) => c.tipo === "ncm");
  const linhasComNcmColuna = linhas.filter((l) => l.ncm != null).length;
  if (!colunaNcmDetectada) {
    avisos.push(
      `NCM embarque: coluna não detectada na planilha (0/${linhas.length} linhas com NCM na coluna).`,
    );
```

### De onde vem o texto na tela

| Camada | Arquivo:linha | Texto |
|--------|---------------|-------|
| Classificação | `apps/api/src/services/cotacao.ts:64-66` | Rótulo `"NCM declarado na planilha do cliente"` em `descDuimp` |
| Resolução NCM | `packages/pipeline/src/resolve-ncm.ts:231-235` | Aviso `NCM declarado na planilha do cliente: 84238900.` em `ncmAvisos` |
| UI badge | `apps/web/src/dashboard.tsx:500-501` | `"Planilha cliente (coluna NCM)"` quando `ncmFonte === "planilha-cliente"` |

### Cadeia que dispara `planilha-cliente`

```151:151:apps/api/src/services/cotacao.ts
      ncmInformado: l.ncm,
```

```52:64:packages/pipeline/src/planilha-cliente-ncm.ts
export function resolverNcmDeclaradoCliente(
  input: { ncmInformado?: string | null },
  linha: LinhaCrua,
  catalog: NcmCatalog,
): PlanilhaClienteNcmHit | null {
  const bruto = (input.ncmInformado ?? linha.ncm ?? "").trim();
  // ...
  return { ncm, confianca: 0.95, provedor: "planilha-cliente" };
}
```

```182:191:apps/api/src/services/cotacao.ts
    const hitCliente = resolverNcmDeclaradoCliente(input, linhas[i]!, state.ncmCatalog);
    if (hitCliente) {
      resultados[i] = outputFromPlanilhaClienteHit(input, hitCliente, state.ncmCatalog);
```

**`input.ncmInformado` no parse do 72 real:** vem de `l.ncm` da linha parseada. **Sem coluna NCM → `l.ncm` é `null` → `ncmInformado` é `null`.**

### Prova local (simulação `montarItens`, provider off)

| Cenário | HY-97 `ncmFonte` | `ncmAvisos[0]` | `planilha-cliente*` |
|---------|------------------|----------------|---------------------|
| 21 linhas cot 72, **`ncm: null`** (upload real) | `siscomex` | `NCM inferido pela tabela Siscomex...` | **0 / 21** |
| 21 linhas com **`ncm` do gabarito** (`84238900`) | `planilha-cliente` | `NCM declarado na planilha do cliente: 84238900.` | **15 / 21** |

→ O rótulo **só aparece quando `linha.ncm` / `ncmInformado` chega preenchido**, não pela planilha física.

### Fontes prováveis do NCM “fantasma” na cot 72 em produção

1. **Gabarito / fixture de teste** — `tools/fixtures/cotacao-72-gabarito.json:73` tem `"ncm": "84238900"` para HY-97; testes passam `ncm: row.ncm` nas linhas (`apps/api/test/gate-cotacao-72-traducao-pt.test.ts:60-62`). Isso **não reflete** a planilha real sem coluna.

2. **Script VPS de patch** — `tools/vps-patch-cot72-embarque-gabarito.mjs:46-47` injeta no meta do item:
   - `meta.ncmEmbarque = gab.ncm`
   - `meta.ncmPlanilhaOriginal = gab.ncm`  
   (NCM do gabarito JSON, não da planilha do cliente.)

3. **Reclassificar cotação salva** — ao reconstruir linhas para re-análise, a API trata meta como NCM de planilha:

```484:484:apps/api/src/services/cotacoes-persist.ts
        ncm: meta.ncmPlanilhaOriginal ?? meta.ncmEmbarque ?? null,
```

   Após patch + `POST /api/cotacoes/:id/reclassificar`, `linha.ncm` volta como `84238900` → `resolverNcmDeclaradoCliente` → rótulo falso.

4. **Dados gravados antes do fix `ncmEmbarque` honesto** (`60e68d7`) — itens antigos podem ter `ncm`/`meta` com NCM classificado persistido como se fosse coluna.

### `ncmEmbarqueStatus` coerente com upload limpo

Com `ncm: null`, HY-97 fica:
- `ncmEmbarque: null`
- `ncmEmbarqueStatus: "sem-ncm-coluna"`  
  (teste: `apps/api/test/ncm-embarque.test.ts:86-100`)

A UI também mostra `"sem NCM na coluna embarque"` (`dashboard.tsx:509-514`) — mas **em paralelo** pode mostrar o badge `planilha-cliente` se `ncmFonte` veio do fluxo acima.

**Conclusão:** não é o parser lendo NCM de coluna inexistente no upload limpo. O rótulo é **efeito de NCM injetado** (gabarito, patch VPS, meta na reclassificação ou dado legado), propagado como `ncmInformado` na Camada A.

---

## 3) Tradução PT — `fix(traducao)` na API vs chinês na cot 72

### Commit do fix

| Campo | Valor |
|-------|-------|
| Hash | `68dd00f` |
| Mensagem | `fix(traducao): restaurar Descricao PT ZH para planilha-cliente (cot 72).` |
| Em `main`? | **Sim** (`git branch --contains 68dd00f` → `main`) |

### O que o fix faz

- Novo módulo `packages/pipeline/src/traducao-pt.ts` — extrai PT embutido no formato `modelo;ZH;PT` e formata `MODELO — tradução`.
- `outputFromPlanilhaClienteHit` e `montarItens` passam por `resolverDescPtFornecedor` (`cotacao.ts:68`, `486-492`).
- Gate bloqueante: `apps/api/test/gate-cotacao-72-traducao-pt.test.ts` — 21 itens sem CJK em `descPt`.

### Estado do código atual (local)

```bash
npx vitest run apps/api/test/gate-cotacao-72-traducao-pt.test.ts
# ✓ 1 test passed
```

Upload simulado com `ncm: null` → **0 itens com CJK** em `descPt`; HY-97:

```
HY-97 — Balança de gancho portátil (dinamômetro de pesagem) — aparelho de pesagem, outros, capacidade não superior a 30 kg
```

### Por que a cot 72 em produção ainda pode mostrar chinês

1. **`descPt` é persistido** no banco no momento do upload/classificação — não é recalculado no `GET` da cotação.
2. Cotação gravada **antes** de `68dd00f` mantém `descPt` antigo (ex.: `descOriginal` cru ou segmento chinês).
3. **Correção para dados já salvos:** `POST /api/cotacoes/:id/reclassificar` (`cotacoes-persist.ts:952-968`) chama `montarItens` de novo → aplica `resolverDescPtFornecedor`.
4. Na simulação pós-patch, mesmo com NCM falso `planilha-cliente`, o `descPt` reclassificado **já sai sem CJK** — o fix de tradução está ativo no código; falta **re-analisar** a cotação persistida.

**Conclusão:** o bug de tradução **está corrigido no código em `main`**. Chinês visível na cot 72 = **dado velho salvo**, não regressão do parser atual. Reclassificar (ou novo upload) aplica o fix.

---

## Resumo executivo

| # | Achado | Ação sugerida (fora deste PR) |
|---|--------|--------------------------------|
| 1 | CI falha: `engine:test` antes de build `@cia/shared` | Reordenar CI ou build shared antes do gate |
| 2 | Rótulo `planilha-cliente` quando `linha.ncm` veio de gabarito/patch/meta, não da planilha | Auditar cot 72: meta `ncmPlanilhaOriginal`; evitar patch; reclassificar com `ncm: null` |
| 3 | `fix(traducao)` em `main`; cot 72 precisa reclassificar para atualizar `descPt` | `POST .../reclassificar` na cot 72 |

---

## Evidências adicionais

- Workflow CI: `.github/workflows/ci.yml`
- Prova upload zero: `tools/proof-cot72-zero-upload.mjs` (espera coluna NCM ausente)
- Patch gabarito: `tools/vps-patch-cot72-embarque-gabarito.mjs`
- Gabarito HY-97 NCM: `tools/fixtures/cotacao-72-gabarito.json:70-74`
