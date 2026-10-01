# Briefing para copiar e colar no Opus IA

Para: **Opus IA**  
De: **Codex**, via Felicio  
Projeto: **CIA Alpha 44**  
Objetivo: revisar minha visao geral e criticar o plano para concluir a plataforma com seguranca.

---

Opus, preciso da sua revisao como arquiteto senior.

Sou o Codex executando no repo do projeto CIA Alpha 44. Fiz uma visao geral do estado atual e quero que voce revise o diagnostico e o plano abaixo, procurando lacunas, riscos de ordem, criterios de aceite fracos e qualquer ponto em que a plataforma poderia parecer "quase pronta" mas ainda ficar perigosa em producao.

## Contexto do projeto

CIA Alpha 44 e uma plataforma de cotacao de importacao China -> Brasil.

Fluxo central:

1. Cliente/importadora envia planilha de produtos.
2. Sistema parseia linhas, pesos, quantidades, FOB, fotos e metadados.
3. Classifica NCM por hierarquia controlada.
4. Calcula impostos e nacionalizacao.
5. Gera revisao, PDF/orcamento e relatorios.

Stack:

- Monorepo TypeScript com npm workspaces.
- `packages/shared`
- `packages/fiscal-engine`
- `packages/pipeline`
- `packages/db`
- `apps/api`
- `apps/web`
- API Fastify + Prisma/Postgres.
- Web React/Vite/Vercel.
- API em VPS Contabo: `https://api2.amzofertas.com.br/cia`.
- Web: `https://cia-alpha44.vercel.app`.

Regras duras do projeto:

1. Nao deixar pendencia escondida numa fase.
2. So mudar de fase quando a anterior funciona e esta provada.
3. NCM/fiscal/producao exige revisao humana e gate verde.
4. Nao tocar no `fiscal-engine` sem aval explicito.
5. Nao rotular NCM como "declarado na planilha do cliente" se a planilha nao tinha coluna NCM.
6. Todo "verde" precisa de prova concreta.

## Minha leitura do estado atual

O projeto ja tem uma base boa:

- Fiscal-engine isolado e testado contra planilha 66.
- Pipeline ja le planilhas/PDF/imagem e extrai fotos embutidas.
- API persiste cotacoes e recalcula cotacoes salvas.
- Web existe em Vercel.
- Classificacao NCM ja tem hierarquia mais honesta:
  1. NCM real da planilha do cliente/importadora;
  2. heranca por familia dentro do mesmo upload;
  3. Gemini/IA validado contra Siscomex;
  4. Siscomex textual como ultimo recurso;
  5. pendente/revisao humana quando nao houver confianca.
- O bug de rotulo falso foi corrigido: NCM injetado por patch/legado vira "NCM de referencia - conferir", nao "declarado na planilha do cliente".

## Ponta solta que precisa fechar primeiro

Existe o PR #4, que reclassifica a cotacao real 72 em producao:

- Cotacao alvo: `cmqlfuhvm000ykw2cue1whldj`
- PR: reclassificar cotacao 72 real.
- CI esta verde.
- Scripts parecem agir so na cotacao informada por ID.
- Mas mexe em producao/banco real.
- Nao ha backup/rollback automatico.
- Proof atual e parcial:
  - cobre zero CJK em `descPt`;
  - cobre zero `planilha-cliente*`;
  - cobre zero aviso falso "declarado na planilha";
  - nao cobre FOB, II, totais, item 9 nem comparacao completa com gabarito.

Minha recomendacao preliminar:

1. Nao iniciar fase de visao/multimodal antes de fechar o PR #4.
2. Antes de rodar PR #4 em VPS:
   - ter backup JSON/SQL da cotacao 72;
   - ter proof ampliado;
   - ter OK humano Felicio/Claude;
   - registrar prova live.

## Fragilidades que encontrei

1. **Operacao/producao**
   - Scripts em `tools/` que mexem em producao nao seguem todos o mesmo padrao de backup/dry-run/proof.
   - Docs antigas ainda citam Render/Neon, mas o runbook real atual usa VPS + Vercel.

2. **PR #4**
   - Isolado por ID, mas irreversivel sem backup.
   - Proof insuficiente para chamar de "concluido com excelencia".

3. **Visao multimodal**
   - Extracao/associacao de fotos ja existe.
   - Classificador Gemini atual usa texto/material/uso, nao imagem.
   - Risco futuro: imagem reordenar ou contaminar pares linha-foto se a implementacao nao preservar a ancora.

4. **Produto/plataforma**
   - Ainda falta consolidar UX de revisao/fechamento sem depender de script.
   - Falta padrao unico de aceite final por sprint.
   - Falta atualizar docs operacionais para novos agentes/humanos.

## Plano proposto para concluir a plataforma

### Fase 0 - Fechar cotacao 72 / PR #4

Objetivo: zerar a pendencia real antes de construir coisa nova.

Passos:

1. Marcar PR #4 como:
   - `AGUARDANDO REVISAO HUMANA - mexe em cotacao real/producao/VPS/banco real`.
2. Adicionar backup ou runbook obrigatorio:
   - snapshot JSON da cotacao;
   - dump SQL de `Cotacao` + `Item`;
   - log com caminho/hash.
3. Ampliar proof:
   - 21 itens;
   - zero CJK em `descPt`;
   - zero `planilha-cliente*` se a planilha nao tinha coluna NCM;
   - zero aviso falso;
   - soma FOB conforme alvo decidido;
   - II/totais se expostos;
   - item 9 reportado explicitamente;
   - diff pre/post de `totalUS`, `totalBRL`, `updatedAt`, fontes NCM.
4. Rodar gate.
5. Felicio/Claude aprovam.
6. Executar na VPS.
7. Registrar prova live.

Pronto quando:

- cotacao 72 real esta reclassificada ou conscientemente mantida;
- backup existe;
- proof completo passa;
- estado esta documentado.

### Fase 1 - Arrumar trilho operacional de producao

Objetivo: qualquer agente/humano saber o que e producao real.

Passos:

1. Atualizar README/docs:
   - API real: `https://api2.amzofertas.com.br/cia`;
   - VPS: `/opt/cia-alpha44`;
   - service: `cia-api`;
   - web: `https://cia-alpha44.vercel.app`;
   - deploy API: `infra/vps/deploy-api.sh`.
2. Criar runbook unico:
   - pre-deploy gate;
   - deploy API;
   - deploy Vercel;
   - checagens pos-push/deploy;
   - handoff.
3. Padronizar scripts produtivos:
   - `--dry-run` quando aplicavel;
   - backup antes de write;
   - confirmacao explicita de cotacao/tenant;
   - output PASS/FAIL;
   - exit code confiavel.

Pronto quando:

- todo push/deploy consegue ser auditado com commit, API, Vercel e proof live.

### Fase 2 - Classificacao por visao multimodal

Objetivo: foto do produto reforcar a classificacao da mesma linha.

Invariantes:

1. Foto nunca reordena item.
2. Foto nunca passa por cima de NCM confirmado humano.
3. Coluna NCM real do cliente continua soberana se valida/coerente.
4. Visao so classifica/corrige a linha correspondente.
5. Saida precisa explicar quando a foto mudou a interpretacao.

Implementacao sugerida:

1. Estender input de classificacao com foto opcional:
   - `fotoBase64` ou `fotoPath`;
   - `fotoMime`;
   - `fotoHash`.
2. Criar provider multimodal separado/feature flag:
   - `CLASSIFICACAO_VISAO_PROVIDER`;
   - fallback para fluxo textual atual.
3. Prompt:
   - descricao original;
   - traducao PT se existir;
   - material/uso;
   - foto da mesma linha;
   - pedir confirmacao/correcao do tipo de produto;
   - retornar candidatos NCM para validacao pelo catalogo.
4. Cache:
   - incluir `fotoHash`/versao multimodal se imagem influenciar decisao;
   - nao misturar cache textual puro com decisao visual.
5. UI:
   - miniatura;
   - badge "visao confirmou" / "visao divergiu";
   - revisao humana.
6. Testes:
   - associacao foto-linha por anchor;
   - fallback por ordem;
   - caso sem foto;
   - caso foto presente mas NCM humano/coluna real prevalece;
   - regressao cotacao 72/fatura 92.

Pronto quando:

- upload com fotos gera classificacao explicavel;
- gates atuais continuam verdes;
- prova mostra que foto X foi usada na linha X.

### Fase 3 - UX de revisao e fechamento

Objetivo: usuario revisar e fechar cotacao sem depender de scripts.

Passos:

1. Tela de itens com filtros:
   - NCM pendente;
   - baixa confianca;
   - divergencia visao/texto;
   - FOB fora de escala;
   - aliquota override/manual.
2. Confirmacao humana:
   - individual;
   - lote;
   - desfazer;
   - usuario/data/motivo.
3. Edicao segura:
   - NCM;
   - FOB/kg;
   - aliquotas override;
   - despesas;
   - parametros fiscais permitidos.
4. PDF/orcamento:
   - bloquear PDF se houver NCM invalido/pendente critico;
   - mostrar rastro NCM/fonte;
   - erro claro no front.
5. Exportacao/auditoria:
   - conciliacao CSV/Excel;
   - snapshot de decisao por item.

Pronto quando:

- uma cotacao sai de upload ate PDF final com revisao humana rastreavel e sem ferramenta manual.

### Fase 4 - Hardening fiscal/comercial

Objetivo: manter motor fiscal confiavel enquanto produto evolui.

Passos:

1. Nao mexer no fiscal-engine sem demanda/aval.
2. Expandir testes reais:
   - cotacao 72;
   - fatura 92;
   - planilha 66;
   - ICMS UF/regime;
   - moedas EUR/USD;
   - FOB bruto/liquido.
3. Rastro de aliquotas:
   - TEC/TIPI/PIS/COFINS;
   - override manual;
   - data/fonte.
4. Alertas:
   - NCM sem aliquota;
   - NCM invalido;
   - FOB absurdo;
   - moeda/cambio inconsistente.

Pronto quando:

- alteracoes de UI/classificacao nao mudam fiscal sem gate quebrar.

### Fase 5 - SaaS minimo

Objetivo: plataforma operavel como produto.

Passos:

1. Auth/tenancy:
   - Clerk validado na API;
   - tenant por usuario/org;
   - roles basicos.
2. Dados:
   - backup DB;
   - restore testado;
   - retencao de uploads/fotos.
3. Observabilidade:
   - logs por cotacao;
   - erro LLM/Siscomex/OCR rastreavel;
   - status providers.
4. Operacao:
   - runbook incidente;
   - seed/migrate seguro;
   - staging/preview para fluxo critico.

Pronto quando:

- novo cliente/tenant usa sem misturar dados e com recuperacao operacional definida.

### Fase 6 - Aceite final de producao

Checklist:

1. CI verde.
2. `npm run gate:pre-deploy` verde.
3. API VPS:
   - HEAD esperado em `/opt/cia-alpha44`;
   - `cia-api` active;
   - `/api/health` OK.
4. Vercel:
   - bundle/SHA esperado visivel.
5. Provas live:
   - cotacao 72;
   - fatura 92;
   - upload com foto/sem foto;
   - PDF final;
   - export conciliacao.
6. Handoff atualizado.

Pronto quando:

- Felicio consegue reproduzir fluxo completo;
- cada numero/decisao importante tem rastro;
- nao ha pendencia escondida.

## Ordem recomendada

1. PR #4 / cotacao 72.
2. Docs/runbook de producao.
3. Padrao de scripts ops.
4. Visao multimodal.
5. UX de revisao.
6. Hardening fiscal/comercial.
7. SaaS/operacao.
8. Aceite final.

## Pedido para voce, Opus IA

Por favor, revise criticamente:

1. A ordem das fases esta correta?
2. Falta alguma fase antes de visao multimodal?
3. O fechamento do PR #4 esta seguro o bastante?
4. O proof proposto cobre o necessario ou falta algum criterio?
5. Ha risco de a visao multimodal quebrar a hierarquia NCM?
6. Quais itens voce colocaria como bloqueadores absolutos antes de chamar a plataforma de pronta?
7. Que testes/gates voce exigiria antes de deploy final?

Nao proponha mexer no `fiscal-engine` sem justificativa forte. Preserve a regra: NCM/fiscal/producao sempre com revisao humana, gate verde e prova.
