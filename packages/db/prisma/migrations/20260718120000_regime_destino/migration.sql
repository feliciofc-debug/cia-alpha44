-- Regimes fiscais por UF de destino (presets parametrizados)
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "regimeDestinoId" TEXT;
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "regimeDestinoParams" JSONB;
