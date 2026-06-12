/**
 * Backfill conservador P2.2 — classifica icmsSaidaManualFlag + avisos sem mutar params.icmsSaida.
 * Idempotente: pode rodar após db:migrate:deploy.
 *
 * Uso: DATABASE_URL=... npm run db:backfill-icms-p2-2 -w @cia/db
 */

import { PrismaClient } from "@prisma/client";
import { auditarIcmsSaidaLegado, type RegimeIcms } from "@cia/shared";

const prisma = new PrismaClient();

type ParamsRow = { icmsSaida?: number };

function regimeValido(v: string): RegimeIcms {
  return v === "NORMAL" ? "NORMAL" : "AL_DIFERIDO";
}

async function main() {
  const rows = await prisma.cotacao.findMany({
    select: {
      id: true,
      destino: true,
      ufEmpresa: true,
      regimeIcms: true,
      params: true,
    },
  });

  let divergentes = 0;
  let auto = 0;

  for (const row of rows) {
    const params = (row.params ?? {}) as ParamsRow;
    const icmsSalvo = typeof params.icmsSaida === "number" ? params.icmsSaida : 0.04;
    const audit = auditarIcmsSaidaLegado({
      icmsSaidaSalvo: icmsSalvo,
      ufEmpresa: row.ufEmpresa ?? "AL",
      destino: row.destino,
      regimeIcms: regimeValido(row.regimeIcms ?? "AL_DIFERIDO"),
    });

    await prisma.cotacao.update({
      where: { id: row.id },
      data: {
        ufEmpresa: row.ufEmpresa ?? "AL",
        regimeIcms: row.regimeIcms ?? "AL_DIFERIDO",
        icmsSaidaManualFlag: audit.icmsSaidaManualFlag,
        avisosFiscais: audit.avisosFiscais,
      },
    });

    if (audit.icmsSaidaManualFlag) divergentes++;
    else auto++;
  }

  console.log(
    `[backfill-icms-p2-2] ${rows.length} cotação(ões): ${auto} auto, ${divergentes} legado divergente (icmsSaida preservado)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
