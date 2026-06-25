#!/usr/bin/env node
/**
 * Prova de rollback sem tocar na cotação real.
 *
 * Lê o backup JSON da cot 72, restaura uma CÓPIA temporária no mesmo tenant,
 * valida contagens básicas e remove a cópia. Se falhar, exit 1.
 *
 * Uso:
 *   source /etc/cia-alpha44/api.env
 *   node tools/test-rollback-cot72-backup.mjs /tmp/cot72-backup/manifest.json
 */
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const manifestPath = process.argv[2] ?? process.env.COT72_BACKUP_MANIFEST;
if (!manifestPath) {
  console.error("Informe o manifest do backup: node tools/test-rollback-cot72-backup.mjs /tmp/.../manifest.json");
  process.exit(1);
}

const p = new PrismaClient();

function scalarCotacao(row, idTeste) {
  return {
    id: idTeste,
    tenantId: row.tenantId,
    empresaTrade: row.empresaTrade,
    cliente: `[ROLLBACK TESTE] ${row.cliente ?? ""}`.slice(0, 200),
    benefFiscal: row.benefFiscal,
    moeda: row.moeda,
    moedaPlanilha: row.moedaPlanilha,
    cambioEurUsd: row.cambioEurUsd,
    cambioEurUsdData: row.cambioEurUsdData,
    cambioEurUsdFonte: row.cambioEurUsdFonte,
    cambio: row.cambio,
    freteTotalUS: row.freteTotalUS,
    adicionaisVaUS: row.adicionaisVaUS,
    reducaoBaseUS: row.reducaoBaseUS,
    siscomex: row.siscomex,
    antidumpingBRL: row.antidumpingBRL,
    incoterm: row.incoterm,
    origem: row.origem,
    destino: row.destino,
    ufEmpresa: row.ufEmpresa,
    regimeIcms: row.regimeIcms,
    icmsSaidaManualFlag: row.icmsSaidaManualFlag,
    avisosFiscais: row.avisosFiscais,
    outrasDespesasBaseBRL: row.outrasDespesasBaseBRL,
    params: row.params,
    status: row.status,
    totalBRL: row.totalBRL,
    totalUS: row.totalUS,
    canalPredominante: row.canalPredominante,
    resultadoCalculo: row.resultadoCalculo,
    calculadoEm: row.calculadoEm,
    criadoEm: new Date(),
  };
}

function scalarItem(it) {
  return {
    ordem: it.ordem,
    descOriginal: it.descOriginal,
    descPt: it.descPt,
    descDuimp: it.descDuimp,
    ncm: it.ncm,
    ncmCandidatos: it.ncmCandidatos,
    pesoBrutoKg: it.pesoBrutoKg,
    pesoLiqKg: it.pesoLiqKg,
    qtd: it.qtd,
    fobUnitarioUS: it.fobUnitarioUS,
    fobTotalUS: it.fobTotalUS,
    fobKgManual: it.fobKgManual,
    aliquotas: it.aliquotas,
    aliquotasOverride: it.aliquotasOverride,
    benchmark: it.benchmark,
    calibracao: it.calibracao,
    risco: it.risco,
    anuencia: it.anuencia,
    antidumping: it.antidumping,
    fotoPath: it.fotoPath,
    meta: it.meta,
  };
}

function scalarDespesa(d) {
  return {
    ordem: d.ordem,
    nome: d.nome,
    valorBRL: d.valorBRL,
    entraBaseSaida: d.entraBaseSaida,
    entraBaseNota: d.entraBaseNota,
  };
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const backup = JSON.parse(await readFile(manifest.paths.cotacaoJson, "utf8"));
  const idTeste = `rollback-test-${backup.id}-${Date.now()}`;
  const reportPath = join(manifest.paths.dir, "rollback-test-report.json");

  let criado = false;
  try {
    await p.cotacao.create({
      data: {
        ...scalarCotacao(backup, idTeste),
        itens: { create: backup.itens.map(scalarItem) },
        despesas: { create: backup.despesas.map(scalarDespesa) },
      },
    });
    criado = true;

    const restored = await p.cotacao.findUnique({
      where: { id: idTeste },
      include: { itens: true, despesas: true },
    });
    const ok =
      restored?.itens.length === backup.itens.length &&
      restored?.despesas.length === backup.despesas.length &&
      restored?.tenantId === backup.tenantId;

    const report = {
      ok,
      tipo: "rollback-test-copy",
      cotacaoOriginal: backup.id,
      cotacaoTeste: idTeste,
      itensEsperados: backup.itens.length,
      itensRestaurados: restored?.itens.length ?? 0,
      despesasEsperadas: backup.despesas.length,
      despesasRestauradas: restored?.despesas.length ?? 0,
      testadoEm: new Date().toISOString(),
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (!ok) {
      console.error(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    console.log(`PASS rollback-test: cópia restaurada e removida (${idTeste})`);
    console.log(`Relatório: ${reportPath}`);
  } finally {
    if (criado) {
      await p.cotacao.delete({ where: { id: idTeste } }).catch(() => undefined);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
