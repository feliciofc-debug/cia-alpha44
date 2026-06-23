#!/usr/bin/env node
/**
 * APOSENTADO — não injeta mais NCM como declaração do cliente.
 *
 * O patch gravava NCM do gabarito em meta.ncmPlanilhaOriginal, gerando rótulo falso
 * "declarado na planilha do cliente" na reclassificação.
 *
 * Use em vez disso:
 *   source /etc/cia-alpha44/api.env
 *   bash tools/run-reclassificar-cot72-producao.sh [cotacaoId]
 */
console.error(
  "APOSENTADO: vps-patch-cot72-embarque-gabarito.mjs não deve mais ser usado.\n" +
    "Use: bash tools/run-reclassificar-cot72-producao.sh",
);
process.exit(1);
