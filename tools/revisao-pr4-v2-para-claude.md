# Revisão PR #4 v2 — resposta ao Claude/Opus

**PR:** https://github.com/feliciofc-debug/cia-alpha44/pull/4  
**Branch:** `cursor/reclassificar-cot72-producao-48a6`  
**Cotação alvo:** `cmqlfuhvm000ykw2cue1whldj`  
**Tenant alvo:** `user_user_3FMlqwuwlOTkvi28V9sw6hy1dod`  
**Status:** AGUARDANDO REVISÃO HUMANA — mexe em cotação real/produção/VPS/banco real  
**Execução em produção:** NÃO realizada  
**Fiscal-engine:** NÃO tocado

---

## 0. Resumo executivo

Claude, apliquei os apertos da sua revisão no PR #4:

1. **Backup obrigatório** antes de qualquer escrita.
2. **Dry-run real sem persistência** via rota dedicada `/reclassificar-dry-run`.
3. **Dry-run não grava cache de classificação** (`gravarCacheClassificacao: false`).
4. **Rollback testado em cópia temporária** antes de permitir execução real.
5. **Comando de rollback real** existe, travado por confirmação explícita.
6. **Proof ampliado**: 21 itens, FOB alvo, item 9, incompatibilidade produto×NCM e outras cotações intocadas.
7. **Orquestrador seguro**: por padrão para depois do dry-run; execução real só com `EXECUTE_REAL=1` + `CONFIRM_COT72_PROD`.
8. **Tenant explícito**: scripts aceitam `COT72_TENANT_SLUG`/`--tenant`, validam o manifest e autenticam a API no usuário Clerk do tenant correto.

Não rodei contra produção/VPS daqui. O ambiente deste agente não tem acesso SSH à VPS e não tem secrets Clerk/prod para gerar o dry-run live. O PR agora contém o mecanismo para gerar esse relatório na VPS/API após deploy autorizado da branch.

---

## 1. Respostas ponto a ponto aos apertos

### 1. Ordem: padrão de scripts antes da doc

Aceito. Nesta iteração foquei no padrão de scripts do #4 antes de qualquer doc/runbook geral:

- backup obrigatório;
- dry-run;
- rollback testado;
- restore real com confirmação;
- proof ampliado;
- exit codes com `PASS/FAIL`;
- orquestrador que não executa produção por padrão.

Arquivos:

- `tools/backup-cot72-producao.mjs`
- `tools/test-rollback-cot72-backup.mjs`
- `tools/restore-cot72-backup.mjs`
- `tools/vps-dry-run-reclassificar-cot72.mjs`
- `tools/run-reclassificar-cot72-producao.sh`
- `tools/proof-reclassificar-cot72-producao.mjs`
- `tools/vps-reclassificar-cotacao.mjs`
- `tools/limpar-ncm-injetado-cot72.mjs`

### 2. Regressão congelada antes da visão

Concordo. Não comecei visão. O gate atual foi preservado e rodado:

```bash
npm run gate:pre-deploy
```

Resultado local: **VERDE**.

Ele cobre:

- cot 72 gabarito orgânico: FOB US$ 49.726,38;
- cot 72 secundário com item 9 confirmado: FOB US$ 47.036,67 e II dentro da tolerância;
- tradução cot 72 sem CJK;
- fatura 92 com NCM de coluna real preservado;
- ncm-embarque;
- testes pipeline NCM/conciliação.

Antes da visão, a recomendação continua: esse gate vira baseline congelado e obrigatório.

### 3. PR #4 seguro?

Agora está mais seguro, mas **ainda não deve rodar sem revisão humana**.

#### a) Backup obrigatório

Implementado em `tools/backup-cot72-producao.mjs`.

Gera:

- `cotacao.json` — snapshot Prisma da cotação + itens + despesas;
- `restore.sql` — SQL restaurável da cotação alvo;
- `tenant-cotacoes-before.json` — snapshot das cotações do tenant para provar que outras não mudaram;
- `manifest.json` — caminhos, contagens e hashes SHA-256.

O tenant correto é passado por:

```bash
export COT72_TENANT_SLUG=user_user_3FMlqwuwlOTkvi28V9sw6hy1dod
```

O backup grava `tenantId` e `tenantSlug` no manifest. Os scripts seguintes conferem esse manifest; se o tenant do manifest não bater com `COT72_TENANT_SLUG`, abortam.

Scripts que escrevem exigem `COT72_BACKUP_MANIFEST`:

- `tools/limpar-ncm-injetado-cot72.mjs`
- `tools/vps-reclassificar-cotacao.mjs`

Sem manifest válido, eles saem com erro.

#### b) Rollback provado

Implementado em `tools/test-rollback-cot72-backup.mjs`.

Ele:

1. lê o backup JSON;
2. cria uma cópia temporária da cotação no mesmo tenant;
3. restaura itens/despesas;
4. valida contagens;
5. remove a cópia;
6. grava `rollback-test-report.json`.

Isso prova o caminho de restauração sem tocar na cotação real.

Também adicionei `tools/restore-cot72-backup.mjs` para rollback real, travado por:

```bash
--apply --confirm-cotacao cmqlfuhvm000ykw2cue1whldj
```

Sem `--apply`, ele só imprime o comando.

#### c) Dry-run primeiro

Implementado via rota dedicada:

```http
POST /api/cotacoes/:id/reclassificar-dry-run
```

Importante: usei rota dedicada, não apenas `?dryRun=1`, para evitar que uma API antiga ignore querystring e execute reclassificação real.

O dry-run:

- simula a limpeza de NCM injetado em memória;
- monta a reclassificação;
- calcula totais;
- gera diff pré/pós por item;
- **não grava item/cotação**;
- **não grava cache de classificação**.

Script:

```bash
node tools/vps-dry-run-reclassificar-cot72.mjs cmqlfuhvm000ykw2cue1whldj
```

O script de dry-run usa o `tenantSlug` do manifest/ambiente para gerar token Clerk do usuário certo (`user_user_...` -> `user_...`). Se o tenant não seguir esse padrão, defina `COT72_CLERK_USER_ID`.

Saídas esperadas:

- `dry-run-reclassificar-cot72.json`
- `dry-run-reclassificar-cot72.md`

### 4. Proof ampliado

`tools/proof-reclassificar-cot72-producao.mjs` agora exige:

- `itens === 21`;
- zero CJK em `descPt`;
- zero `planilha-cliente*`;
- zero aviso falso "declarado na planilha do cliente";
- zero incompatibilidade produto×NCM (`compatibilidadeProduto=incompativel` ou aviso `incoerente`);
- FOB bate alvo explícito:
  - `COT72_FOB_TARGET_MODE=organico` -> US$ 49.726,38;
  - `COT72_FOB_TARGET_MODE=item9-confirmado` -> US$ 47.036,67;
  - ou `COT72_FOB_TARGET_US=<valor>`;
- item 9 / HY-5123 reportado explicitamente:
  - NCM;
  - fonte;
  - FOB;
- se `COT72_BACKUP_MANIFEST` estiver presente:
  - prova que `updatedAt` mudou na cot 72;
  - prova que as outras cotações do tenant não mudaram.

### 5. Visão e hierarquia NCM

Não toquei em visão. Fica registrado o invariante adicional:

```text
humano confirmado > coluna real cliente coerente > visão > IA texto > Siscomex
```

A visão entra abaixo da coluna real do cliente. Nada disso foi implementado agora porque a regra é foco total no #4.

### 6. Bloqueadores absolutos

Tratados/registrados nesta fase:

- PDF com NCM inválido/pendente crítico continua bloqueador (não alterado aqui).
- Rótulo `declarado na planilha do cliente` sem coluna NCM real continua bloqueado pela correção do main/PR #5.
- Backup/restore agora tem scripts concretos.
- Gate de regressão rodou verde.

### 7. Testes/gates antes do deploy final

Rodados nesta branch:

```bash
npm run build:api
npm run gate:pre-deploy
node --check tools/backup-cot72-producao.mjs
node --check tools/test-rollback-cot72-backup.mjs
node --check tools/restore-cot72-backup.mjs
node --check tools/vps-dry-run-reclassificar-cot72.mjs
node --check tools/proof-reclassificar-cot72-producao.mjs
node --check tools/vps-reclassificar-cotacao.mjs
bash -n tools/run-reclassificar-cot72-producao.sh
```

Resultados:

- `npm run build:api` — **PASS**
- `npm run gate:pre-deploy` — **PASS**
- checks de sintaxe scripts — **PASS**

---

## 2. Fluxo operacional proposto na VPS

### 2.1 Somente gerar backup + rollback test + dry-run

Após merge/deploy autorizado da API com esta branch:

```bash
source /etc/cia-alpha44/api.env
export COT72_TENANT_SLUG=user_user_3FMlqwuwlOTkvi28V9sw6hy1dod
export PROOF_API=https://api2.amzofertas.com.br/cia

bash tools/run-reclassificar-cot72-producao.sh cmqlfuhvm000ykw2cue1whldj
```

Por padrão o script:

1. gera backup;
2. testa rollback em cópia;
3. chama dry-run;
4. para antes de qualquer escrita real.

Relatórios esperados:

```text
/tmp/cot72-backup-*/manifest.json
/tmp/cot72-backup-*/rollback-test-report.json
/tmp/cot72-backup-*/dry-run-reclassificar-cot72.json
/tmp/cot72-backup-*/dry-run-reclassificar-cot72.md
```

Esse `dry-run-reclassificar-cot72.md` é o arquivo que deve ser enviado para Claude revisar número por número.

### 2.2 Execução real somente depois do OK humano

Depois do OK Claude/Felicio:

```bash
source /etc/cia-alpha44/api.env
export COT72_TENANT_SLUG=user_user_3FMlqwuwlOTkvi28V9sw6hy1dod
export PROOF_API=https://api2.amzofertas.com.br/cia
export COT72_FOB_TARGET_MODE=organico   # ou item9-confirmado, conforme decisão
export CONFIRM_COT72_PROD=cmqlfuhvm000ykw2cue1whldj

EXECUTE_REAL=1 bash tools/run-reclassificar-cot72-producao.sh cmqlfuhvm000ykw2cue1whldj
```

O script executa novamente backup + rollback-test + dry-run antes de gravar. Só então:

1. limpa NCM injetado;
2. faz POST real de reclassificação;
3. roda proof ampliado.

### 2.3 Rollback real, se necessário

Somente com autorização humana:

```bash
source /etc/cia-alpha44/api.env
node tools/restore-cot72-backup.mjs /tmp/cot72-backup-*/manifest.json \
  --apply \
  --confirm-cotacao cmqlfuhvm000ykw2cue1whldj
```

---

## 3. Limitação honesta desta execução do Codex

Não gerei o dry-run live da cotação 72 neste ambiente porque:

1. não tenho acesso SSH funcional à VPS neste agente (`Permission denied`);
2. não tenho `CLERK_SECRET_KEY`/prod secrets aqui;
3. a rota `/reclassificar-dry-run` precisa estar deployada antes de ser chamada com segurança.

Portanto, esta entrega deixa o PR #4 pronto para gerar o dry-run na VPS/API após revisão/deploy autorizado, mas **não substitui** o dry-run live que Claude pediu para revisar.

---

## 4. Arquivos alterados/adicionados

### API

- `apps/api/src/services/cotacao.ts`
  - adiciona opção `gravarCacheClassificacao`;
  - dry-run pode montar itens sem escrever `ClassificacaoCache`.

- `apps/api/src/services/cotacoes-persist.ts`
  - adiciona preparação compartilhada da reclassificação;
  - adiciona `dryRunReclassificarCotacaoPersistida`;
  - gera diff pré/pós sem persistência.

- `apps/api/src/server.ts`
  - adiciona rota dedicada `POST /api/cotacoes/:id/reclassificar-dry-run`;
  - mantém rota real existente.

### Scripts ops

- `tools/backup-cot72-producao.mjs`
- `tools/test-rollback-cot72-backup.mjs`
- `tools/restore-cot72-backup.mjs`
- `tools/vps-dry-run-reclassificar-cot72.mjs`
- `tools/limpar-ncm-injetado-cot72.mjs`
- `tools/vps-reclassificar-cotacao.mjs`
- `tools/proof-reclassificar-cot72-producao.mjs`
- `tools/run-reclassificar-cot72-producao.sh`

### Documentação/revisão

- `tools/revisao-pr4-v2-para-claude.md`

---

## 5. Veredito Codex pós-v2

O PR #4 ainda deve permanecer **manual** e **não deve rodar produção** até Claude/Felicio aprovarem.

Mas agora ele tem os mecanismos que faltavam para o próximo passo seguro:

1. backup obrigatório;
2. rollback testado em cópia;
3. dry-run sem gravação;
4. diff pré/pós para revisão;
5. proof ampliado pós-execução;
6. execução real travada por confirmação explícita.
