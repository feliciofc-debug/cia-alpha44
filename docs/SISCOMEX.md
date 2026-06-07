# Portal Único Siscomex — NCM oficial (estrutura pronta)

Integração **plugável** com o Portal Único (CLSF + TTCE), no mesmo padrão do OCR e da IA.

**Estado atual:** estrutura pronta na API, **desligada por padrão**. O fluxo de upload → IA → cálculo **não muda** até vocês ativarem com o certificado da Alpha 44.

## O que já existe (sem certificado)

| Endpoint | Função |
|----------|--------|
| `GET /api/meta` | Campos `siscomexConfigurado`, `siscomexOperacional` |
| `GET /api/siscomex/status` | Status detalhado da integração |
| `POST /api/ncm/conferir` | Cruza NCM planilha × IA (Siscomex entra quando ativo) |

Exemplo — conferência só planilha × IA (funciona hoje):

```bash
curl -s -X POST https://api2.amzofertas.com.br/cia/api/ncm/conferir \
  -H "content-type: application/json" \
  -d '{"itens":[{"ncmPlanilha":"94052100","ncmIa":"94052100","descricao":"LED Panel"}]}'
```

## Quando o certificado chegar

### 1. Copiar certificado A1 para a VPS

```bash
mkdir -p /etc/cia-alpha44/certs
chmod 700 /etc/cia-alpha44/certs
# copiar alpha44.pfx para /etc/cia-alpha44/certs/
chmod 600 /etc/cia-alpha44/certs/alpha44.pfx
```

### 2. Editar `/etc/cia-alpha44/api.env`

```env
SISCOMEX_PROVIDER=portal-unico
SISCOMEX_AMBIENTE=validacao
SISCOMEX_CERT_PATH=/etc/cia-alpha44/certs/alpha44.pfx
SISCOMEX_CERT_PASSWORD=senha-do-pfx
SISCOMEX_ATIVO=false
```

**Alternativa — Chaves de Acesso** (geradas no Portal Único com o certificado):

```env
SISCOMEX_CLIENT_ID=...
SISCOMEX_CLIENT_SECRET=...
```

### 3. Homologar no ambiente de validação

1. `GET /api/siscomex/status` → deve mostrar `configurado: true`, `operacional: false`
2. Implementar/finalizar chamadas HTTP em `apps/api/src/siscomex/portal-unico.ts`
3. Testar CLSF + TTCE no ambiente **validacao**
4. Só então: `SISCOMEX_ATIVO=true` e `systemctl restart cia-api`

### 4. Produção

```env
SISCOMEX_AMBIENTE=producao
SISCOMEX_ATIVO=true
```

## Ambientes Portal Único

| Ambiente | URL base |
|----------|----------|
| Validação | `https://val.portalunico.siscomex.gov.br` |
| Homologação | `https://hom.pucomex.serpro.gov.br` |
| Produção | `https://portalunico.siscomex.gov.br` |

## Documentação oficial

- [Classificação Fiscal (CLSF)](https://docs.portalunico.siscomex.gov.br/api/clsf/)
- [Tratamento Tributário (TTCE)](https://docs.portalunico.siscomex.gov.br/api/ttce/)
- [Autenticação](https://api-docs.portalunico.siscomex.gov.br/introducao-api-publica/)
- [Chaves de Acesso](https://api-docs.portalunico.siscomex.gov.br/pages/chaves-acesso/)

## Custo

Consultas CLSF/TTCE no Portal Único: **gratuitas**.  
Custo fixo: certificado e-CNPJ que a trade **já possui** (~renovação anual).

## Arquitetura no código

```
apps/api/src/siscomex/
├── types.ts          # contrato SiscomexProvider
├── config.ts         # variáveis de ambiente
├── stub.ts           # inativo (padrão)
├── portal-unico.ts   # adapter real (HTTP pendente homologação)
├── conferencia.ts    # lógica planilha × IA × Siscomex
└── index.ts          # factory (auto | stub | portal-unico)
```

O adapter `AliquotaSource` em `@cia/pipeline` continua com cache TEC local; TTCE oficial será plugado na Fase 3 sem quebrar o motor fiscal.
