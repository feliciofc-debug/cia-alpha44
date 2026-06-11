# Fontes oficiais — seed TEC/TIPI (Tarefa 2)

Arquivos **obrigatórios** para `node tools/fetch-tec-tipi.cjs`. O script tenta baixar automaticamente; se falhar, coloque os arquivos aqui manualmente.

| Arquivo local | Fonte oficial | URL |
|---------------|---------------|-----|
| `tec-aplicada-brasil.xlsx` | MDIC/CAMEX — Res. Gecex 272/2021 (Anexos I–X) | https://www.gov.br/mdic/pt-br/assuntos/camex/estrategia-comercial/arquivos-listas/12-09-2025-anexos-i-a-x-resolucao-gecex-272-21.xlsx/@@download/file |
| `tipi.xlsx` | RFB — TIPI vigente | https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx/@@download/file |
| `autopecas-mdic.xlsx` | MDIC — Lista Autopeças (Regime Autopeças) | https://www.gov.br/mdic/pt-br/assuntos/sdic/setor-automotivo/regime-autopecas/documentos-regime-de-autopecas/ListaAutopeasRes284v24032022.xlsx/@@download/file |

## PIS/COFINS

Exceções em `pis-cofins-excecoes.json` (curado; cada entrada exige `fundamentoLegal`).

Regenerar entradas de autopeças a partir da lista MDIC:

```bash
node tools/build-pis-cofins-excecoes.cjs
```

## Trava de cobertura

O gerador **aborta** se &lt; 98% dos NCM-8 de `ncm-vigente.json` tiverem II (MDIC) ou IPI (TIPI) encontrados.
