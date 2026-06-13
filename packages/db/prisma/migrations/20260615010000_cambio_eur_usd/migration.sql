-- P2c v1.1: taxa EUR→US$ (PTAX cross) persistida na cotação
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "cambioEurUsd" DECIMAL(12,6);
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "cambioEurUsdData" TEXT;
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "cambioEurUsdFonte" TEXT;
