# Diagnostico dry-run cot72 — fonte falsa `planilha-cliente`

**Cotacao alvo:** `cmqlfuhvm000ykw2cue1whldj`  
**Tenant alvo:** `user_user_3FMlqwuwlOTkvi28V9sw6hy1dod`  
**Escopo deste documento:** diagnostico somente. Nao executei producao, nao rodei `EXECUTE_REAL=1` e nao alterei `fiscal-engine`.

## Resumo

O dry-run cumpriu seu papel: impediu escrita real e expôs que a cot 72 salva ainda carrega autoridade falsa de NCM de planilha.

O problema nao esta no motor fiscal. A cadeia que explica `antes == depois` e `Fonte = planilha-cliente` em 18/21 itens e:

1. A reclassificacao de cotacao salva reconstrói linhas cruas a partir dos itens persistidos.
2. Essas linhas recebem `linha.ncm` a partir de `meta.ncmEmbarqueStatus` via `ncmColunaEmbarqueParaClassificacao`.
3. Se o meta persistido diz `ncmEmbarqueStatus="coluna"`, o NCM vira `linha.ncm`.
4. `resolverNcmDeclaradoCliente` ve `linha.ncm` valido/coerente e retorna `provedor="planilha-cliente"`.
5. `resolveNcm` transforma esse provedor no rótulo final `fonte="planilha-cliente"`.
6. Se a limpeza em memoria removeu os campos de meta, ainda existe uma segunda rota provável: o dry-run continua **lendo** cache de classificacao antigo; ele apenas desabilita a **gravacao** de cache. Um cache salvo com `classificacaoProvedor="planilha-cliente"` reintroduz a mesma fonte.

Conclusao: para a cot 72 salva, corrigir apenas upload novo nao basta. O saneamento precisa neutralizar o dado legado persistido (`ncmEmbarqueStatus="coluna"` sem coluna real) e impedir reaproveitamento de cache antigo `planilha-cliente` para este fluxo.

## Evidencias principais

### 1. O safe flow nao chama a limpeza real antes do dry-run

No orquestrador, a etapa segura faz backup, rollback-test e dry-run; a limpeza real so aparece depois do bloco `EXECUTE_REAL`.

- `tools/run-reclassificar-cot72-producao.sh:29-30`: chama `tools/vps-dry-run-reclassificar-cot72.mjs`.
- `tools/run-reclassificar-cot72-producao.sh:32-44`: se `EXECUTE_REAL != 1`, para antes da execucao real.
- `tools/run-reclassificar-cot72-producao.sh:49-51`: `tools/limpar-ncm-injetado-cot72.mjs` so roda na fase real.

Portanto, se o relatorio do dry-run mostrou "21 itens limpos", isso veio da limpeza **em memoria** da rota dry-run (`rowComLimpezaNcmInjetado`), nao de uma atualizacao persistida no banco.

### 2. A limpeza atual nao remove itens marcados como `coluna`

Ha duas implementacoes equivalentes de limpeza:

- script operacional: `tools/limpar-ncm-injetado-cot72.mjs:73-86`;
- limpeza em memoria do dry-run: `apps/api/src/services/cotacoes-persist.ts:465-475`.

Ambas usam a mesma regra central:

```ts
status !== "coluna" && Boolean(meta.ncmPlanilhaOriginal || meta.ncmEmbarque)
```

Evidencias:

- `tools/limpar-ncm-injetado-cot72.mjs:75-80`: calcula `tinhaInjetado` com `status !== "coluna"`.
- `tools/limpar-ncm-injetado-cot72.mjs:84-86`: so se `tinhaInjetado`, apaga `ncmPlanilhaOriginal`, zera `ncmEmbarque` e seta `sem-ncm-coluna`.
- `apps/api/src/services/cotacoes-persist.ts:465-475`: a limpeza em memoria do dry-run usa o mesmo criterio.

Logo, se os 18 itens persistidos estao com `ncmEmbarqueStatus="coluna"`, a limpeza atual os considera "coluna real" e nao corrige. Isso explica diretamente por que eles continuam como `planilha-cliente`.

### 3. Como `ncmEmbarqueStatus="coluna"` vira `planilha-cliente`

Na reclassificacao de cotacao salva:

- `apps/api/src/services/cotacoes-persist.ts:1032-1038`: `prepararReclassificacaoCotacaoPersistida` chama `linhasCruasFromItensPersistidos(row.itens)` e depois `montarItens(...)`.
- `apps/api/src/services/cotacoes-persist.ts:545-558`: `linhasCruasFromItensPersistidos` define `linha.ncm` usando `ncmColunaEmbarqueParaClassificacao(meta, ...)`.
- `packages/pipeline/src/item-meta.ts:54-65`: `ncmColunaEmbarqueParaClassificacao` retorna `meta.ncmEmbarque ?? meta.ncmPlanilhaOriginal` quando `ncmEmbarqueStatus === "coluna"`.
- `apps/api/src/services/cotacao.ts:143-160`: `classificarEmLotes` passa esse `linha.ncm` como `ncmInformado`.
- `apps/api/src/services/cotacao.ts:195-200`: `resolverNcmDeclaradoCliente` roda antes de cache, Gemini/IA e Siscomex; se houver hit, grava `resultados[i]` como planilha-cliente.
- `packages/pipeline/src/planilha-cliente-ncm.ts:51-64`: `resolverNcmDeclaradoCliente` aceita `input.ncmInformado ?? linha.ncm`, valida TEC/coerencia e retorna `provedor: "planilha-cliente"`.
- `apps/api/src/services/cotacao.ts:402-405`: `resolveNcm` recebe `fonteClassificacao` derivada do provedor.
- `packages/pipeline/src/resolve-ncm.ts:220-243`: quando `fonteClassificacao` e `planilha-cliente`, retorna `fonte: "planilha-cliente"` e aviso "NCM declarado na planilha do cliente".

Isso cria um loop para dado legado:

```text
meta.status="coluna" -> linha.ncm -> resolverNcmDeclaradoCliente -> fonte planilha-cliente
```

Se a planilha original da cot 72 nao tinha coluna NCM, esse `status="coluna"` e dado legado incorreto.

### 4. PR #5 protege upload novo/meta saneado, mas nao corrige sozinho o dado salvo como `coluna`

A funcao adicionada/coberta pelo PR #5 faz a coisa certa quando o item esta marcado como `sem-ncm-coluna`:

- `packages/pipeline/src/item-meta.ts:40-47`: `referenciaNcmLegado` so trata NCM legado como referencia quando `ncmEmbarqueStatus === "sem-ncm-coluna"`.
- `packages/pipeline/src/item-meta.ts:54-65`: `ncmColunaEmbarqueParaClassificacao` retorna `null` para `sem-ncm-coluna`.
- `packages/pipeline/test/item-meta-ncm-referencia.test.ts:36-44`: teste garante que meta injetado sem coluna vira `null`, nao autoridade `planilha-cliente`.
- `packages/pipeline/test/item-meta-ncm-referencia.test.ts:57-70`: teste garante rótulo honesto "NCM de referência — conferir" e ausencia de "declarado na planilha".

Mas o mesmo codigo deliberadamente retorna NCM quando o status e `coluna`:

- `packages/pipeline/test/item-meta-ncm-referencia.test.ts:27-33`: teste "coluna real" retorna NCM da coluna.

Assim, cot 72 salva com `ncmEmbarqueStatus="coluna"` continua sendo tratada como se tivesse coluna real. O fix de upload novo nao tem como adivinhar que esse `coluna` salvo e falso; precisa saneamento/migracao especifica para a cotacao legada.

## Respostas as perguntas

### 1. A limpeza esta realmente removendo o NCM injetado? Ou limpa um campo e a classificacao le outro campo?

Resposta curta: depende do caso, e ha duas rotas que explicam o dry-run.

**Caso A — itens com `ncmEmbarqueStatus="coluna"`:** a limpeza nao remove. Ela pula esses itens por design (`status !== "coluna"`). A classificacao le `ncmEmbarque`/`ncmPlanilhaOriginal` via `ncmColunaEmbarqueParaClassificacao` e volta para `planilha-cliente`.

Evidencias:

- `tools/limpar-ncm-injetado-cot72.mjs:75-86`
- `apps/api/src/services/cotacoes-persist.ts:465-475`
- `packages/pipeline/src/item-meta.ts:54-65`

**Caso B — dry-run reportou 21 limpos mas a fonte continuou `planilha-cliente`:** a limpeza em memoria pode ter removido meta, mas a classificacao ainda pode ler **cache antigo**.

Evidencias:

- `apps/api/src/services/cotacoes-persist.ts:1073-1077`: dry-run chama limpeza em memoria e `prepararReclassificacao...` com `gravarCacheClassificacao: false`.
- `apps/api/src/services/cotacao.ts:393-395`: essa flag so controla `gravarCache`.
- `apps/api/src/services/cotacao.ts:216-226`: mesmo assim, o fluxo continua lendo `lookupClassificacaoCacheDetalhe(...)` e usando `cached.output`.
- `apps/api/src/services/classificacao-cache.ts:65-86`: lookup retorna o output persistido do cache.
- `apps/api/src/services/classificacao-cache.ts:59-63`: hoje o cache so bloqueia `planilha-china` como toxico; nao bloqueia `planilha-cliente` legado.

Essa segunda rota encaixa com o sintoma "21 limpos" + "18 continuam planilha-cliente": o dry-run limpou o meta em memoria, mas reutilizou cache antigo que ainda dizia `classificacaoProvedor="planilha-cliente"`.

### 2. De onde vem `ncmEmbarqueStatus="coluna"` se a planilha original nao tem NCM?

Pelo codigo atual, `coluna` nasce quando `montarItens` recebe uma linha com `l.ncm` preenchido:

- `apps/api/src/services/cotacao.ts:432-442`: `ncmColuna = l.ncm ? normNcm8(l.ncm) : null`; se existe, `ncmEmbarqueStatus = "coluna"`.
- `apps/api/src/services/cotacao.ts:443-448`: quando o status e `coluna`, `ncmEmbarque = ncmColuna`.
- `apps/api/src/services/cotacao.ts:486-488`: esse status e persistido no meta do item.

Para cotacao salva, `l.ncm` e reconstruido de meta:

- `apps/api/src/services/cotacoes-persist.ts:545-558`.

Portanto, se a planilha 72 realmente nao tinha coluna NCM, `ncmEmbarqueStatus="coluna"` em 18 itens e quase certamente legado persistido incorreto de uma fase anterior (patch/import/reclassificacao antiga que gravou NCM como se fosse coluna). O codigo atual nao tem uma heuristica historica para diferenciar "coluna real" de "coluna falsa" depois que esse status ja foi salvo.

### 3. O conserto do PR #5 so vale para upload novo, mas cot 72 salva tem status errado?

Sim. O PR #5 protege o caso correto (`sem-ncm-coluna`) e rotula NCM legado como referencia. Mas, para cot 72 ja salva com `status="coluna"`, o fluxo continua confiando nesse status.

Para consertar a cot 72 real, a limpeza precisa corrigir o dado persistido, nao apenas apagar `ncmPlanilhaOriginal` quando `status !== "coluna"`.

Saneamento esperado para cot 72 legada, antes da reclassificacao real:

```text
para itens nao humanos da cot 72:
  se sabemos que a planilha original nao tinha coluna NCM:
    ncmEmbarqueStatus = "sem-ncm-coluna"
    ncmEmbarque = null
    remover ncmPlanilhaOriginal
    opcionalmente preservar o NCM antigo como ncmReferencia, nao como planilha-cliente
```

Mas isso ainda pode nao bastar se houver cache antigo. O dry-run tambem precisa ignorar/invalidar cache com `classificacaoProvedor="planilha-cliente"` quando a linha reconstruida nao tem coluna NCM real.

### 4. Por que markup continua 6% e `descPt` nao muda?

**Markup:** a reclassificacao recalcula os itens usando os `params` salvos da cotacao. Ela nao redefine `markupPct` para o default atual.

Evidencias:

- `apps/api/src/services/cotacoes-persist.ts:1032-1038`: reclassificacao parte da cotacao salva (`mapRowParaDominio`) e chama `montarItens`.
- `apps/api/src/services/cotacoes-persist.ts:1052-1053`: monta `cotacaoCalc` com a cotacao original e itens novos.
- `apps/api/src/services/cotacao.ts:562-565`: `calcularCotacao` aplica ICMS e copia os params resultantes.
- `packages/shared/src/icms-cotacao.ts:32-40` e `58-63`: `aplicarIcmsCotacao` preserva `paramsBase` e so ajusta ICMS.

Se a cot 72 salva tem `params.markupPct = 0.06`, o dry-run deve continuar 6%. Isso e esperado para cotacao antiga, a menos que exista uma decisao explicita de migrar/alterar markup.

**descPt:** enquanto a fonte continuar `planilha-cliente` via meta ou cache, a pipeline para antes de chamar Gemini/IA.

Evidencias:

- `apps/api/src/services/cotacao.ts:195-200`: hit `resolverNcmDeclaradoCliente` encerra o caminho para esse item.
- `apps/api/src/services/cotacao.ts:216-226`: hit de cache tambem encerra o caminho.
- `apps/api/src/services/cotacao.ts:229-230`: so itens sem hit entram nos indices LLM.

Assim, se os 18 itens continuam batendo como planilha/cache, `descPt` tende a ficar igual. O dry-run nao esta chegando na etapa que geraria nova traducao/classificacao.

## Diagnostico final

O dry-run revelou dois pontos que precisam ser tratados antes de qualquer execucao real:

1. **Dado legado persistido:** 18 itens da cot 72 parecem estar com `ncmEmbarqueStatus="coluna"` embora a planilha nao tivesse coluna NCM. A limpeza atual preserva `coluna`; portanto, nao corrige essa falsidade.
2. **Cache antigo:** mesmo quando a limpeza em memoria diz que limpou itens, o fluxo ainda le cache de classificacao. Cache com `classificacaoProvedor="planilha-cliente"` pode reintroduzir a mesma fonte falsa, porque hoje so `planilha-china` e considerado cache toxico.

## Recomendacao para a proxima correcao (nao implementada aqui)

Nao executar `EXECUTE_REAL=1` ainda.

Antes, preparar um PR de correcao com:

1. modo de saneamento especifico/explicito para cot 72 sem coluna NCM real;
2. dry-run mostrando antes/depois de `meta.ncmEmbarqueStatus`, `ncmEmbarque`, `ncmPlanilhaOriginal`, `ncmReferencia` e `ncmFonte`;
3. bloqueio/ignore de cache `planilha-cliente` quando `linha.ncm` vier de dado legado ou quando o fluxo declarar que a planilha nao tem coluna NCM;
4. teste cobrindo cotacao salva com `ncmEmbarqueStatus="coluna"` falso + cache antigo `planilha-cliente`, garantindo que a reclassificacao nao retorna `planilha-cliente`.

So depois disso faz sentido gerar novo backup + rollback-test + dry-run para revisao humana.
