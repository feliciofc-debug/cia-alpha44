#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { calcularCotacao } from "../apps/api/dist/services/cotacao.js";
import { mapRowParaDominio } from "../apps/api/dist/services/cotacoes-persist.js";
import { createAppState } from "../apps/api/dist/state.js";
import { fobUsadoNoEngine } from "../apps/api/dist/services/fob-kg-manual.js";

const id = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const p = new PrismaClient();
const row = await p.cotacao.findUnique({
  where: { id },
  include: { itens: { orderBy: { ordem: "asc" } }, despesas: true },
});
await p.$disconnect();
if (!row) throw new Error("not found");

const state = await createAppState();
const { cotacao, itens } = mapRowParaDominio(row);
cotacao.itens = itens;
const r = calcularCotacao(cotacao, state);

let sumEngine = 0;
let sumEmb = 0;
let sumFt = 0;
for (const it of r.itens) {
  const eng = fobUsadoNoEngine(it, it.calibracao ?? {});
  sumEngine += eng;
  sumEmb += it.fobEmbarqueUS ?? 0;
  sumFt += it.fobTotalUS ?? 0;
}

console.log(
  JSON.stringify(
    {
      fobEntradaPdf: r.resultado.entrada.fobTotalUS,
      sumFobUsadoNoEngine: sumEngine,
      sumFobEmbarqueUS: sumEmb,
      sumFobTotalUS_posCalc: sumFt,
      alvoPauloPlanilhaXbruto: 47036,
      item3_lixador: {
        ncm: r.itens[3]?.ncm,
        fobEmbarqueUS: r.itens[3]?.fobEmbarqueUS,
        fobTotalUS: r.itens[3]?.fobTotalUS,
        pesoBruto: r.itens[3]?.pesoBrutoKg,
        fobKgPlan: r.itens[3]?.benchmark?.fobKgMedioDI,
        engine: fobUsadoNoEngine(r.itens[3], r.itens[3]?.calibracao ?? {}),
      },
    },
    null,
    2,
  ),
);
