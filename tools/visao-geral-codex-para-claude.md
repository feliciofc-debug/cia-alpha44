# Visao geral Codex para Claude - CIA Alpha 44

**Origem:** Codex, via Felicio  
**Destino:** Claude  
**Data:** 2026-06-25  
**Escopo:** diagnostico somente; nenhum codigo operacional alterado.  
**Base local analisada:** `main` em `/workspace` + PR #4 (`cursor/reclassificar-cot72-producao-48a6`).  
**PR #4:** https://github.com/feliciofc-debug/cia-alpha44/pull/4

---

## 0. Veredito executivo

1. **PR #4 deve ser fechado antes da fase de visao**, mas **nao deve ser executado na VPS sem OK humano e backup previo**. Ele mexe em cotacao real (`cmqlfuhvm000ykw2cue1whldj`) e, pela politica do projeto, e caso manual.
2. **O script age so na cotacao informada por ID**, desde que o operador passe/confira o ID correto. A limpeza usa `findUnique({ id })` e depois `item.update({ id do item })` nos itens daquela cotacao (PR #4: `tools/limpar-ncm-injetado-cot72.mjs:12-43`).
3. **Nao ha reversibilidade automatica no PR #4.** O passo de limpeza apaga campos de `meta`; o passo de reclassificacao regrava `descPt`, `descDuimp`, `ncm`, aliquotas, FOB, meta e totais da cotacao dentro da API (`apps/api/src/services/cotacoes-persist.ts:528-543`, `apps/api/src/services/cotacoes-persist.ts:992-1004`). Sem snapshot, rollback e manual.
4. **O proof do PR #4 cobre o aceite de rotulo/traducao**, mas nao cobre todo o risco fiscal/financeiro: valida zero CJK em `descPt`, zero `planilha-cliente*`, zero aviso "declarado na planilha"; nao valida FOB, II, totais, item 9 nem comparacao com gabarito (`tools/proof-reclassificar-cot72-producao.mjs:41-64`; limitacao ja registrada no relatorio do PR em `tools/revisao-pr4-para-claude.md:382-386` no diff).
5. **CI do PR #4 esta verde**: `CI / test-and-build` concluiu `SUCCESS` no GitHub; Vercel previews tambem estao verdes segundo `gh pr view 4`.
6. **A arquitetura principal esta coerente para a fase atual:** monorepo TS, fiscal-engine isolado, pipeline de ingestao/classificacao, API Fastify/Prisma, web Vite/Vercel. A fragilidade maior hoje e operacional: scripts de producao sem backup/rollback automatizado e docs antigas citando Render/Neon enquanto o runbook atual do projeto usa VPS/Vercel.

---

## 1. Arquitetura atual observada

### 1.1 Monorepo e workspaces

- Root usa npm workspaces para `packages/*` e `apps/*` (`package.json:7-10`).
- Scripts principais:
  - `npm run build:api` compila shared, fiscal-engine, pipeline, db e api (`package.json:17`).
  - `npm run build:web` compila shared e web (`package.json:18`).
  - `npm run gate:pre-deploy` aponta para o gate obrigatorio (`package.json:26`).

### 1.2 Pacotes

- `@cia/fiscal-engine`: motor fiscal puro, exporta `calcCotacao`, `calcEntrada`, `calcSaida` (`packages/fiscal-engine/src/index.ts:22-25`).
- `@cia/pipeline`: parser, imagens, traducao, NCM, benchmark, calibracao FOB/kg (`packages/pipeline/package.json:2-4`).
- `@cia/db`: Prisma/Postgres (`packages/db/package.json:2-4`; schema em `packages/db/prisma/schema.prisma`).
- `@cia/shared`: schemas e utilitarios comuns (NCM, PDF, ICMS, moeda).
- `apps/api`: Fastify + Clerk + Prisma + pipeline/engine (`apps/api/package.json:13-26`).
- `apps/web`: React/Vite/Clerk; build Vercel injeta SHA curto em `VITE_BUILD_SHA` (`apps/web/src/lib/build-info.ts:1-2`, `vercel.json:4-6`).

### 1.3 Persistencia

- `Cotacao` tem tenant, cabecalho, params, totais e snapshot `resultadoCalculo` (`packages/db/prisma/schema.prisma:36-87`).
- `Item` guarda descricao, NCM, candidatos, pesos, FOB, aliquotas, foto e `meta` JSON estendido (`packages/db/prisma/schema.prisma:94-123`).
- `ClassificacaoCache` persiste resultado de classificacao por chave deterministica e marca confirmacao humana (`packages/db/prisma/schema.prisma:143-155`).

### 1.4 API

- API registra CORS, multipart, auth, rate limit e health (`apps/api/src/server.ts:78-85`).
- Endpoint de reclassificacao persistida: `POST /api/cotacoes/:id/reclassificar` chama `reclassificarCotacaoPersistida(id, tenantSlug, state)` (`apps/api/src/server.ts:824-829`).

### 1.5 Ingestao e fotos

- Ingestao aceita planilhas, PDF e imagens; planilha passa por parser e conversao EUR->USD (`apps/api/src/services/ingest.ts:59-75`).
- Extracao de imagens XLSX ja existe e associa foto a linha por anchor, ordem 1:1 ou proximidade (`packages/pipeline/src/xlsx-images.ts:1-4`, `packages/pipeline/src/xlsx-images.ts:142-191`).
- Esse desenho favorece a proxima fase de visao "Jeito A": foto + descricao da mesma linha, sem reembaralhar pares.

---

## 2. O que esta solido

### 2.1 Fiscal-engine isolado e com gabarito

- `calcCotacao` roda entrada -> saida -> total global sem depender da API (`packages/fiscal-engine/src/index.ts:22-44`).
- Entrada documenta formulas e valida a cascata da planilha 66 (`packages/fiscal-engine/src/entrada.ts:1-16`).
- Saida documenta markup, base, ICMS, PIS/COFINS, IPI, CSLL, IRRF (`packages/fiscal-engine/src/saida.ts:1-18`).
- Teste `engine-66` compara item, totais e diferenca honesta de Siscomex (`packages/fiscal-engine/test/engine-66.test.ts:4-13`, `packages/fiscal-engine/test/engine-66.test.ts:129-138`).

### 2.2 Honestidade de NCM cliente vs legado/patch

- O meta diferencia coluna real, heranca e ausencia de coluna (`packages/pipeline/src/item-meta.ts:13-17`).
- `ncmColunaEmbarqueParaClassificacao` retorna NCM so quando ha coluna real/heranca, ou confirmacao humana; meta injetado com `sem-ncm-coluna` vira `null` (`packages/pipeline/src/item-meta.ts:50-66`).
- Exibicao de legado injetado vira "NCM de referencia - conferir" e nao "declarado na planilha" (`packages/pipeline/src/item-meta.ts:35-47`, `packages/pipeline/src/item-meta.ts:98-127`).
- Testes cobrem coluna real, heranca, sem coluna e meta injetado ignorado (`apps/api/test/ncm-embarque.test.ts:38-118`; `packages/pipeline/test/item-meta-ncm-referencia.test.ts:26-71`).

### 2.3 Hierarquia NCM esta explicitada no codigo

- `planilha-cliente-ncm.ts` diz que NCM da planilha de embarque e autoridade, e heranca so usa linhas do mesmo upload (`packages/pipeline/src/planilha-cliente-ncm.ts:1-4`).
- Coluna cliente so passa se NCM existe no catalogo e e coerente com familia (`packages/pipeline/src/planilha-cliente-ncm.ts:51-64`).
- Heranca por familia tambem exige NCM valido, coerente e score minimo (`packages/pipeline/src/planilha-cliente-ncm.ts:67-98`).
- Siscomex textual e ultimo recurso (`packages/pipeline/src/planilha-cliente-ncm.ts:104-123`).
- `resolveNcm` afirma que Siscomex e a unica fonte de codigos vigentes; planilha/IA so prevalecem se existirem na tabela oficial e forem coerentes (`packages/pipeline/src/resolve-ncm.ts:1-4`).
- Gemini e validado contra catalogo vigente e tem fallback se sugerir NCM inexistente (`packages/pipeline/src/resolve-ncm.ts:266-294`; `packages/pipeline/test/resolve-ncm-gemini.test.ts:43-53`).

### 2.4 Gates relevantes para cotacao 72/fatura 92

- Gate cot 72 garante que o classificador `planilha-china` nao volte (`apps/api/test/gate-cotacao-72-gabarito.test.ts:167-176`).
- Gate cot 72 valida FOB organico US$ 49.726,38 com item 9 Gemini (`apps/api/test/gate-cotacao-72-gabarito.test.ts:191-218`).
- Gate secundario valida US$ 47.036,67 quando item 9 e confirmado manualmente (`apps/api/test/gate-cotacao-72-gabarito.test.ts:221-255`).
- Gate traducao garante 21 itens sem CJK em `descPt` (`apps/api/test/gate-cotacao-72-traducao-pt.test.ts:59-84`).
- Gate fatura 92 preserva planilha com NCM real como `planilha-cliente`/familia e nao `planilha-china` (`apps/api/test/gate-fatura-92-planilha-cliente.test.ts:40-73`).
- `gate-pre-deploy` roda build shared/pipeline e os testes obrigatorios antes de deploy VPS (`tools/gate-pre-deploy.mjs:12-17`, `tools/gate-pre-deploy.mjs:29-76`).

### 2.5 CI esta alinhado ao bug recente de workspace

- Workflow faz `npm ci`, build do `@cia/shared`, engine test, build API e build web (`.github/workflows/ci.yml:23-36`). Isso cobre o bug de "shared nao buildado antes do engine:test".

---

## 3. Fragilidades, inconsistencias e dividas

### P0 - PR #4 sem backup/rollback automatico

- O script de limpeza remove `ncmPlanilhaOriginal`, seta `ncmEmbarque = null` e `ncmEmbarqueStatus = "sem-ncm-coluna"` item a item (PR #4: `tools/limpar-ncm-injetado-cot72.mjs:36-43`).
- A reclassificacao da API regrava campos centrais dos itens: `descPt`, `descDuimp`, `ncm`, `ncmCandidatos`, `fobTotalUS`, `fobUnitarioUS`, aliquotas, benchmark, calibracao, risco e meta (`apps/api/src/services/cotacoes-persist.ts:528-543`).
- A mesma operacao atualiza status/totais/params/resultadoCalculo/calculadoEm da cotacao (`apps/api/src/services/cotacoes-persist.ts:992-1004`).
- Nao ha snapshot automatico no PR #4. O proprio relatorio do PR registra: "nao ha backup automatico" e recomenda dump JSON/SQL manual (diff do PR #4: `tools/revisao-pr4-para-claude.md:295-335`).

**Risco:** se o proof falhar depois da reclassificacao, a cotacao real ja foi alterada e a recuperacao depende de backup externo/manual.

### P0 - PR #4 e execucao real exigem revisao humana

- E operacao contra producao/VPS/banco real. Pela politica do projeto, nao e merge automatico.
- O corpo atual do PR #4 descreve a operacao, mas a frase de bloqueio da politica ("AGUARDANDO REVISAO HUMANA - mexe em ...") deve ficar explicita no PR antes de qualquer merge/execucao.
- CI verde e necessario, mas nao suficiente para rodar em producao.

### P1 - Proof do PR #4 e parcial

- O proof confere CJK, `planilha-cliente*` e aviso falso (`tools/proof-reclassificar-cot72-producao.mjs` no PR #4: criterios em linhas 44-64).
- O script `vps-reclassificar-cotacao.mjs` do main checa apenas se sobrou `planilha-china`, imprime soma FOB e II se presente (`tools/vps-reclassificar-cotacao.mjs:36-48`).
- Falta prova pos-op comparando a cotacao real contra o gabarito minimo: 21 itens, FOB organico/esperado conforme decisao, item 9, II/totais e ausencia de regressao em NCMs conhecidos.

### P1 - Documentacao de producao esta divergente

- README/docs ainda descrevem Render/Neon como producao (`README.md:76-89`; `docs/ECOSYSTEM.md:1-18`).
- O runbook atual do projeto (regras workspace) aponta API em VPS Contabo `/opt/cia-alpha44` e web Vercel.
- `infra/vps/deploy-api.sh` de fato atualiza `/opt/cia-alpha44`, roda Docker Postgres, build API, migrate/seed e systemd `cia-api` (`infra/vps/deploy-api.sh:19-23`, `infra/vps/deploy-api.sh:43-52`, `infra/vps/deploy-api.sh:89-107`).

**Risco:** agentes/humanos novos podem seguir docs antigas e assumir deploy/DB errados.

### P1 - Proxima fase de visao precisa preservar invariantes atuais

- Ja existe extracao/associacao de fotos por linha (`packages/pipeline/src/xlsx-images.ts:142-191`), mas classificacao Gemini atual usa apenas descricao/material/uso textual (`apps/api/src/llm/classificar-gemini-lovable.ts:33-56`).
- A extensao multimodal deve manter a ancora foto<->linha e nao deixar a foto reordenar itens.
- A visao deve reforcar/corrigir descricao da mesma linha, nao criar nova hierarquia que pule coluna real do cliente ou confirmacao humana.

### P2 - README e docs de arquitetura estao defasados

- README ainda diz "api/web (a construir)" apesar do sistema ja ter API/web reais (`README.md:13-16`).
- Isso nao afeta runtime, mas aumenta custo de onboarding e risco de decisoes erradas.

---

## 4. Revisao especifica do PR #4

### 4.1 O que o PR adiciona

Segundo `gh pr view 4`:

- `tools/limpar-ncm-injetado-cot72.mjs`
- `tools/proof-reclassificar-cot72-producao.mjs`
- `tools/run-reclassificar-cot72-producao.sh`
- `tools/revisao-pr4-para-claude.md`

Nao altera `fiscal-engine`, API, web ou schema.

### 4.2 O script age so nessa cotacao?

**Sim, por design, se o ID correto for usado.**

- Default/arg/env: `COT_ID = argv[2] ?? COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj"` (PR #4: `tools/limpar-ncm-injetado-cot72.mjs:12`).
- Busca uma unica cotacao por ID: `p.cotacao.findUnique({ where: { id: COT_ID } ... })` (PR #4: `tools/limpar-ncm-injetado-cot72.mjs:15-18`).
- Atualiza cada item por `id` pertencente ao resultado carregado daquela cotacao (PR #4: `tools/limpar-ncm-injetado-cot72.mjs:40-43`).
- Orquestrador passa o mesmo `COT_ID` para limpeza, POST e proof (PR #4: `tools/run-reclassificar-cot72-producao.sh:6-19`).

**Risco residual:** se alguem passar outro ID na linha de comando, ele reclassifica outra cotacao. Mitigacao: comando operacional deve passar explicitamente `cmqlfuhvm000ykw2cue1whldj` e o log deve ser conferido antes/depois.

### 4.3 Preserva confirmacao humana e coluna real?

**A limpeza preserva.**

- So limpa quando `!humano`, `status !== "coluna"` e existe `ncmPlanilhaOriginal` ou `ncmEmbarque` (PR #4: `tools/limpar-ncm-injetado-cot72.mjs:27-34`).
- Reclassificacao tambem preserva confirmacao humana ao reconstruir linha com `ncmConfirmadoHumano` se vigente (`apps/api/src/services/cotacoes-persist.ts:478-500`).
- Reclassificacao preserva `fobKgManual` e aliquotas override do item antigo (`apps/api/src/services/cotacoes-persist.ts:973-982`).

### 4.4 E reversivel?

**Nao automaticamente.**

- Passo 1 apaga informacao de `meta` sem arquivar.
- Passo 2 reescreve item/cotacao na transacao da API.
- Proof e leitura apenas, mas se falhar a alteracao ja aconteceu.

**Requisito antes de rodar:** backup SQL ou JSON da cotacao 72 antes do passo 1, com caminho e hash/log guardados no handoff.

### 4.5 Proof cobre aceite?

**Cobre parcialmente.**

Cobre:
- `descPt` sem CJK.
- Zero `ncmFonte` `planilha-cliente`/`planilha-cliente-familia`.
- Zero aviso contendo "declarado na planilha do cliente".

Nao cobre:
- 21 itens.
- FOB total esperado.
- II/totais esperados.
- item 9 e decisao organico vs confirmado manualmente.
- ausencia de alteracao em outras cotacoes.
- diff pre/post para auditoria.

### 4.6 CI verde?

**Sim.** `gh pr view 4` mostra:

- `CI / test-and-build`: `SUCCESS`.
- Vercel preview contexts: `SUCCESS`.
- PR mergeable: `MERGEABLE`.

**Importante:** por tocar producao/banco real, CI verde nao autoriza execucao sem OK humano.

---

## 5. O que falta para concluir com excelencia

### P0 - Fechar PR #4 com runbook seguro

1. Marcar explicitamente no PR: **AGUARDANDO REVISAO HUMANA - mexe em cotacao real/producao/VPS/banco real**.
2. Antes de merge/execucao: exigir `gate:pre-deploy` verde se houver deploy API (`tools/gate-pre-deploy.mjs:1-5`, `tools/gate-pre-deploy.mjs:76`).
3. Antes de rodar na VPS: gerar backup SQL/JSON da cotacao 72 e registrar caminho.
4. Rodar somente apos OK humano.
5. Proof pos-op deve incluir criterios atuais + gabarito numerico minimo.

### P0 - Nao iniciar visao antes do estado da cot 72 ficar provado

O proprio projeto tem gate de cot 72 e fatura 92; usar esses criterios para fechar a ponta solta antes de alterar classificacao multimodal:

- Cot 72 traducao sem CJK (`apps/api/test/gate-cotacao-72-traducao-pt.test.ts:59-84`).
- Cot 72 FOB organico/secundario (`apps/api/test/gate-cotacao-72-gabarito.test.ts:191-255`).
- Fatura 92 com NCM real preservada (`apps/api/test/gate-fatura-92-planilha-cliente.test.ts:40-73`).

### P1 - Ampliar proof operacional do PR #4

Adicionar ou complementar proof com:

- contagem de itens = 21;
- fontes NCM por item;
- `descPt` sem CJK;
- zero `planilha-cliente*`;
- zero aviso falso;
- soma FOB e comparacao com alvo decidido;
- II/totais se o payload expuser;
- amostra item 9;
- snapshot pre/post de `updatedAt`, `totalUS`, `totalBRL`, `resultadoCalculo`.

### P1 - Atualizar docs de producao

Alinhar README/docs com a realidade atual:

- API: `https://api2.amzofertas.com.br/cia`, VPS `/opt/cia-alpha44`, service `cia-api`.
- Web: `https://cia-alpha44.vercel.app`.
- Deploy API via `infra/vps/deploy-api.sh`.
- Remover/arquivar narrativa Render/Neon ou marcar como historica.

### P1 - Desenhar visao sem quebrar hierarquia atual

Quando entrar na fase multimodal:

- manter coluna NCM real e confirmacao humana soberanas;
- usar foto apenas como reforco da mesma linha;
- incluir `fotoPath`/imagem no input do classificador sem alterar ordem;
- testar planilha com foto embaralhada/proxima para garantir que `associarFotosLinhas` nao muda pares;
- adicionar gate que prova "descricao linha X + foto linha X" no prompt/output.

### P2 - Reduzir drift de scripts ops

Ha muitos scripts em `tools/`; os scripts que mexem em prod devem ter padrao unico:

- dry-run quando aplicavel;
- backup automatico;
- confirmacao explicita de cotacao/tenant;
- output JSON resumido;
- proof acoplado;
- handoff atualizado apos deploy/execucao.

---

## 6. Recomendacao final ao Claude/Felicio

**Minha recomendacao:**

1. Nao rodar PR #4 ainda.
2. Primeiro exigir backup automatizado ou, no minimo, comando de backup manual escrito no runbook e executado antes.
3. Atualizar a descricao do PR #4 com o bloqueio de revisao humana.
4. Depois de OK humano, merge/deploy conforme politica, rodar o script na VPS e anexar proof ampliado.
5. So entao iniciar a fase de visao.

**Resumo curto:** o PR #4 esta bem isolado e CI verde, mas a ausencia de backup/rollback automatico e o proof parcial impedem chamar isso de "concluido com excelencia" antes da execucao controlada e prova completa.
