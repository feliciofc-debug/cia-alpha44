-- P2c: moeda da planilha do fornecedor (ex.: EUR)
ALTER TABLE "Cotacao" ADD COLUMN IF NOT EXISTS "moedaPlanilha" TEXT;
