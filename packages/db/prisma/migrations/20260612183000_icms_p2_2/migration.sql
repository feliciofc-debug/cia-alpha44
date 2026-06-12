-- P2.2: ICMS ufEmpresa / regime / flag manual / avisos (sem alterar params.icmsSaida)
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "ufEmpresa" TEXT NOT NULL DEFAULT 'AL';
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "regimeIcms" TEXT NOT NULL DEFAULT 'AL_DIFERIDO';
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "icmsSaidaManualFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "avisosFiscais" JSONB NOT NULL DEFAULT '[]';

-- Backfill de flags/aviso: npm run db:backfill-icms-p2-2 -w @cia/db (não altera icmsSaida em params)
