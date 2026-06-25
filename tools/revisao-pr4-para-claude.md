# Relatório de revisão — PR #4 (reclassificar cot 72 produção)

**PR:** https://github.com/feliciofc-debug/cia-alpha44/pull/4  
**Branch:** `cursor/reclassificar-cot72-producao-48a6`  
**Cotação alvo:** `cmqlfuhvm000ykw2cue1whldj` (contêiner 72)  
**Data:** 2026-06-23  
**Status:** AGUARDANDO REVISÃO HUMANA — execução contra produção/VPS/banco real  
**Merge / execução:** NÃO realizados

---

## ⚠️ Aviso importante antes de rodar na VPS

Os scripts deste PR **ainda não estão em `main`** (só na branch do PR #4). O deploy atual da VPS (`82b8dc4`) tem o **PR #5** (rótulo honesto na API), mas **não** inclui:

- `tools/limpar-ncm-injetado-cot72.mjs`
- `tools/proof-reclassificar-cot72-producao.mjs`
- `tools/run-reclassificar-cot72-producao.sh`

**Opções antes de executar:**

1. **Mergear o PR #4** e fazer `git reset --hard origin/main` + redeploy na VPS, **ou**
2. Copiar manualmente os 3 scripts da branch para a VPS (provisório, não recomendado sem merge)

O passo 2 do fluxo (`vps-reclassificar-cotacao.mjs`) **já existe em `main`** e chama `POST /api/cotacoes/:id/reclassificar`.

---

## 1. `limpar-ncm-injetado-cot72.mjs` — o que apaga exatamente?

### Escopo: só UMA cotação por ID

```javascript
const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const row = await p.cotacao.findUnique({
  where: { id: COT_ID },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
```

- Usa `findUnique({ where: { id: COT_ID } })` — **não há** `findMany`, `updateMany` nem filtro por cliente.
- Só altera itens **dessa** cotação. As outras 10+ cotações do backfill ICMS **não são tocadas**.

### Condição para limpar um item (todas devem ser verdadeiras)

| # | Condição | Significado |
|---|----------|-------------|
| 1 | `meta.ncmRevisadoHumano !== true` | **Preserva** confirmação humana de NCM |
| 2 | `meta.ncmEmbarqueStatus !== "coluna"` | **Preserva** NCM de coluna real do cliente |
| 3 | `meta.ncmPlanilhaOriginal` **ou** `meta.ncmEmbarque` preenchido | Só remove se havia NCM injetado no meta |

### O que é REMOVIDO do `meta` (por item elegível)

```javascript
delete meta.ncmPlanilhaOriginal;
meta.ncmEmbarque = null;
meta.ncmEmbarqueStatus = "sem-ncm-coluna";
```

### O que NÃO é alterado

| Campo / dado | Tocado? |
|--------------|---------|
| `item.ncm` (coluna Prisma) | **Não** neste script (só `meta`) |
| `descOriginal`, `descPt`, `descDuimp` | **Não** |
| `fobKgManual`, `fobTotalUS`, pesos, qtd | **Não** |
| `ncmRevisadoHumano`, `ncmConfirmado`, confirmação humana | **Não** (item ignorado) |
| Itens com `ncmEmbarqueStatus === "coluna"` | **Não** (item ignorado) |
| Outras cotações | **Não** |
| `material`, `uso`, `compatibilidadeProduto`, FOB benchmark, etc. no meta | **Não** (permanecem no objeto meta) |

### Alinhamento com PR #5 (já em produção)

Com API `82b8dc4`, a reclassificação usa `ncmColunaEmbarqueParaClassificacao` (`cotacoes-persist.ts:485-487`), que **já ignora** meta injetado com `sem-ncm-coluna`. O script `limpar` é uma **higiene extra** no banco para remover lixo legado do patch antes de reclassificar — não é estritamente obrigatório se o meta já estiver limpo, mas evita resíduos visuais (`ncmPlanilhaOriginal` fantasma).

---

## 2. É reversível? Tem backup?

### Resposta curta: **não há backup automático no PR #4.**

Os scripts **não** fazem snapshot antes de alterar. Se der errado, a reversão é **manual**.

### O que cada passo altera (irreversível sem backup)

| Passo | Operação | Efeito |
|-------|----------|--------|
| 1 `limpar` | `UPDATE item SET meta = ...` | Remove NCM injetado do meta (valores apagados, não arquivados) |
| 2 `reclassificar` | `POST /api/cotacoes/:id/reclassificar` | Reescreve **todos** os itens: `descPt`, `descDuimp`, `ncm`, `meta`, FOB recalculado, totais da cotação (`persistirItensPosReclassificacao`, `cotacoes-persist.ts:528-544`) |
| 3 `proof` | `GET` somente leitura | Não altera nada |

### O que a reclassificação preserva

De `reclassificarCotacaoPersistida` (`cotacoes-persist.ts:973-982`):

- `fobKgManual` por item
- `aliquotasOverride` + alíquotas manuais se override ativo
- `id` e `ordem` dos itens
- Itens com `ncmRevisadoHumano` vigente → linha reconstruída com `ncmConfirmado` (não reclassifica à toa)

### Como reverter se der errado (recomendado ANTES de rodar)

**Backup obrigatório recomendado** — o PR não inclui, mas você pode fazer na VPS:

```bash
# Opção A — dump JSON da cotação (rápido, suficiente para auditoria)
source /etc/cia-alpha44/api.env
curl -sS -H "Authorization: Bearer $JWT" \
  "https://api2.amzofertas.com.br/cia/api/cotacoes/cmqlfuhvm000ykw2cue1whldj" \
  > /tmp/cot72-backup-$(date +%Y%m%d-%H%M%S).json

# Opção B — backup SQL das tabelas item + cotacao (restauração completa)
pg_dump "$DATABASE_URL" -t '"Cotacao"' -t '"Item"' \
  --data-only --column-inserts \
  -f /tmp/cot72-backup-$(date +%Y%m%d-%H%M%S).sql
```

**Restauração:** reimportar JSON manualmente ou `psql` com o dump — **não há script de rollback** no repositório.

### Risco residual

- Se o passo 1 rodar e o passo 2 **falhar**, o meta já foi limpo mas NCM/descrições antigas na coluna `item.ncm` / `descPt` **ainda existem** até a reclassificação completar.
- Se o passo 2 **completar**, NCM e traduções mudam para o resultado do classificador atual (Gemini/Siscomex conforme env) — **sem desfazer automático**.

---

## 3. `proof-reclassificar-cot72-producao.mjs` — critérios e falha no meio

### Critérios de aceite (todos obrigatórios para `exit 0`)

| Critério | Verificação | Falha se |
|----------|-------------|----------|
| **0 CJK em `descPt`** | Regex `[\u4e00-\u9fff...]` em cada item | Qualquer caractere chinês em `descPt` |
| **0 `planilha-cliente*`** | `ncmFonte` ∉ `{planilha-cliente, planilha-cliente-familia}` | Qualquer item com essas fontes |
| **0 aviso falso** | Nenhum `ncmAvisos` contendo *"declarado na planilha do cliente"* | Aviso falso presente |

### Saída em caso de sucesso

```
PASS proof-reclassificar-cot72-producao
exit 0
```

### Saída em caso de falha

```
FAIL proof-reclassificar-cot72-producao
exit 1
```

Lista detalhada: quais ordens falharam em CJK, fonte ou aviso. Amostra HY-97 no final.

### O que acontece se falhar **no meio** do `run-reclassificar-cot72-producao.sh`

O orchestrator usa `set -euo pipefail`:

| Falha em | Passos seguintes | Estado do banco |
|----------|------------------|-----------------|
| Passo 1 (`limpar`) | 2 e 3 **não rodam** | Inalterado (ou parcial se crash mid-loop — improvável, 1 item/update) |
| Passo 2 (`reclassificar`) | Passo 3 **não roda** | Meta possivelmente limpo (passo 1 ok) + cotação **não** reclassificada |
| Passo 3 (`proof`) | — | Limpar + reclassificar **já aplicados**; proof só lê e reporta FAIL |

**Importante:** proof **não desfaz** nada. FAIL no passo 3 significa “rodou mas não passou no aceite” — exige análise manual ou restore do backup.

### Limitações do proof

- Não valida totais FOB/II (só NCM + tradução + rótulos).
- Não compara com gabarito numérico da cot 72.
- `vps-reclassificar-cotacao.mjs` (passo 2) checa só `planilha-china` tóxico — critérios diferentes do proof.

---

## 4. Só cot 72 ou pode afetar outras cotações?

### Isolamento por design

| Componente | Mecanismo de isolamento |
|------------|-------------------------|
| `limpar-ncm-injetado-cot72.mjs` | `findUnique({ id: COT_ID })` + `item.update({ where: { id: it.id } })` só itens dessa row |
| `vps-reclassificar-cotacao.mjs` | `POST /api/cotacoes/${COT_ID}/reclassificar` — ID na URL |
| `proof-reclassificar-cot72-producao.mjs` | `GET /api/cotacoes/${COT_ID}` — leitura só dessa cotação |
| `run-reclassificar-cot72-producao.sh` | `COT_ID="${1:-cmqlfuhvm000ykw2cue1whldj}"` — default explícito cot 72 |

### Riscos de afetar outra cotação (baixos, mas existem)

1. **ID errado na linha de comando** — passar outro UUID reclassifica **essa** cotação. Mitigação: sempre passar o ID explicitamente e conferir o log `Reclassificando cotação ...`.
2. **Cache de classificação LLM** (`classificacaoCache` no Postgres) — reclassificar **pode gravar** entradas de cache reutilizáveis em **outras** cotações futuras com mesma `descOriginal`. Isso é comportamento normal da API, não corrupção de outra cotação salva.
3. **Backfill ICMS** mencionado no deploy — processo **separado**, não invocado por estes scripts.

### As outras ~10 cotações do tenant

**Não são alteradas** por estes scripts, desde que o `COT_ID` seja o da cot 72.

---

## Checklist para o Claude / Felicio

| Pergunta | Veredito |
|----------|----------|
| Mexe só na cot 72? | **Sim**, se `COT_ID=cmqlfuhvm000ykw2cue1whldj` |
| Preserva confirmação humana e coluna real? | **Sim** — `limpar` ignora `ncmRevisadoHumano` e `status === "coluna"` |
| Tem backup automático? | **Não** — fazer backup manual antes |
| Proof cobre o que importa? | **Parcial** — CJK + rótulo falso + fonte; não cobre FOB/II |
| Scripts na VPS hoje? | **Não** — PR #4 ainda não mergeado; mergear ou copiar scripts antes |
| API pronta para reclassificar limpo? | **Sim** — PR #5 (`82b8dc4`) já em produção |

---

## Recomendação operacional (antes de “pode rodar”)

1. **Mergear PR #4** (ou garantir scripts na VPS).
2. **Backup** JSON ou SQL da cot 72 (`/tmp/cot72-backup-*.json`).
3. Conferir ID: `cmqlfuhvm000ykw2cue1whldj`.
4. Rodar: `bash tools/run-reclassificar-cot72-producao.sh cmqlfuhvm000ykw2cue1whldj`.
5. Exigir `PASS proof-reclassificar-cot72-producao` no final.
6. Se FAIL → **não** repetir cegamente; analisar log ou restaurar backup.

---

## Arquivos do PR #4

| Arquivo | Função |
|---------|--------|
| `tools/limpar-ncm-injetado-cot72.mjs` | Higiene meta NCM injetado |
| `tools/vps-reclassificar-cotacao.mjs` | POST reclassificar (já em main) |
| `tools/proof-reclassificar-cot72-producao.mjs` | Aceite pós-operação |
| `tools/run-reclassificar-cot72-producao.sh` | Orquestra 1→2→3 com `set -e` |

**Não altera:** fiscal-engine, hierarquia NCM, código da API (só scripts ops).
