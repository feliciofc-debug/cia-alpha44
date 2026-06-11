# Relatório ComexStat — investigação paralela

Gerado em: 2026-06-11T09:46:35.596Z

## Filtros (COMEXSTAT_CHINA_MARITIMO_2023S1)

```json
{
  "paisId": 160,
  "viaId": "01",
  "periodoDe": "2023-01",
  "periodoAte": "2023-06"
}
```

Planilha mensal (cabeçalho linha 3): 2023-S1 · país 160 · via marítima 01 — mesma fonte.

## 1. Paginação e metadata

**1ª requisição paginada:** `https://api-comexstat.mdic.gov.br/general?language=pt&page=1&perPage=100`
- Linhas retornadas na 1ª página (perPage=100): **5788**
- Metadata extraída do JSON cru:
```json
{
  "language": "pt",
  "success": true,
  "dataKeys": [
    "list"
  ]
}
```

**Loop paginação (perPage=500):** 2 requisição(ões)

| página | linhas | primeiroNcm | ultimoNcm | repetida | totalPages | totalRecords |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 5788 | 85414300 | 84483917 | — | — | — |
| 2 | 5788 | 85414300 | 84483917 | true | — | — |

## 2. Conector atual vs paginação

- Conector atual (`fetchComexStatImport`): **5788** linhas (1 POST, sem `language=pt`, sem loop)
- Paginação agregada: **5788** linhas únicas
- Resposta 1ª página com perPage=100: **5788** linhas

> **Hipótese 1ª página:** REFUTADA para estes filtros — API devolve o dataset inteiro num único `data.list` (~5788 NCMs), mesmo com `page=1&perPage=100`. Parâmetros `page/perPage` aparentemente **ignorados** neste endpoint/consulta.

Amostra JSON cru (top-level + 1º item), conector atual:
```json
{
  "keys": [
    "data",
    "success",
    "message",
    "processo_info",
    "language"
  ],
  "dataKeys": [
    "list"
  ],
  "language": "pt",
  "processo_info": null,
  "primeiroItem": {
    "coNcm": "85414300",
    "year": "2023",
    "ncm": "Células fotovoltaicas montadas em módulos ou em painéis",
    "metricFOB": "2043198874",
    "metricCIF": "2104940283",
    "metricKG": "472602990"
  }
}
```

## 3. Cobertura NCMs alvo

| NCM | conector_atual | pagina_1_per100 | slice_100_conector | paginacao_completa | FOB_USD | KG |
| --- | --- | --- | --- | --- | --- | --- |
| 94051190 | presente | presente | presente | presente | 64,580,911 | 14,352,970 |
| 94051110 | presente | presente | ausente | presente | 278,961 | 6,645 |
| 94052100 | presente | presente | ausente | presente | 885,454 | 252,438 |
| 87116000 | presente | presente | ausente | presente | 8,275,410 | 1,771,120 |
| 85044010 | presente | presente | ausente | presente | 27,518,131 | 3,582,505 |
| 73269090 | presente | presente | presente | presente | 46,223,079 | 15,681,001 |

Coluna `slice_100_conector`: simula o que aconteceria se o conector usasse apenas as **100 primeiras linhas** da resposta (ordem da API, não NCM).

## 4. Valor 94051190 — API vs planilha

| Métrica | Valor |
| --- | --- |
| Planilha mensal FOB/kg (média simples DI, ~1952 refs) | 1.90724668715675 |
| API metricFOB / metricKG (agregado semestre) | 4.49948066 |
| Diferença % (API − planilha) / planilha | 135.91% |
| API metricFOB (USD) | 64,580,911 |
| API metricKG | 14,352,970 |

> **Hipótese valor:** CONFIRMADA — divergência grande. API ComexStat retorna **FOB total ÷ KG total** (média ponderada pelo volume importado no semestre). Planilha INNOVE (~1952 DIs) usa **média aritmética simples** de FOB/kg por DI (`1,90724668715675`). Não é erro de paginação.

## 5. Resumo executivo

| métrica | valor |
| --- | --- |
| Linhas 1ª req (perPage=100) | 5788 |
| Linhas conector atual | 5788 |
| Linhas paginação agregada | 5788 |
| totalPages / totalRecords na API | não informado |
| NCMs alvo presentes (conector) | 6/6 |
| NCMs alvo na simulação slice(100) | 2/6 |
| 94051190 FOB/kg API | 4.499481 |
| 94051190 FOB/kg planilha | 1.90724668715675 |
| Diferença % | 135.91% |

## Próximo passo (fora deste script)

- Ajuste benchmark T6: priorizar **planilha mensal** (média simples) sobre ComexStat agregado quando ambos existirem.
- Se no futuro a API passar a respeitar `page/perPage`, implementar loop até `totalPages` em `comexstat-api.ts`.
