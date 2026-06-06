-- Etapa 2c: separar empresa trade do cliente final
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "empresaTrade" TEXT NOT NULL DEFAULT '';
