-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CotacaoStatus" AS ENUM ('RASCUNHO', 'CALCULADA', 'ARQUIVADA');

-- CreateEnum
CREATE TYPE "CanalAduaneiro" AS ENUM ('VERDE_PROVAVEL', 'AMARELO_TECNICO', 'VERMELHO_TECNICO', 'CINZA_VALORACAO');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cliente" TEXT NOT NULL DEFAULT '',
    "benefFiscal" TEXT NOT NULL DEFAULT 'ALAGOAS',
    "moeda" TEXT NOT NULL DEFAULT 'US$',
    "cambio" DECIMAL(12,6) NOT NULL,
    "freteTotalUS" DECIMAL(14,4) NOT NULL,
    "adicionaisVaUS" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reducaoBaseUS" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "siscomex" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "antidumpingBRL" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "incoterm" TEXT NOT NULL DEFAULT 'CFR',
    "origem" TEXT NOT NULL DEFAULT 'RJ',
    "destino" TEXT NOT NULL DEFAULT 'SP',
    "outrasDespesasBaseBRL" DECIMAL(14,2),
    "params" JSONB NOT NULL,
    "status" "CotacaoStatus" NOT NULL DEFAULT 'RASCUNHO',
    "totalBRL" DECIMAL(16,2),
    "totalUS" DECIMAL(14,4),
    "canalPredominante" "CanalAduaneiro",
    "resultadoCalculo" JSONB,
    "calculadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "descOriginal" TEXT NOT NULL,
    "descPt" TEXT NOT NULL DEFAULT '',
    "descDuimp" TEXT NOT NULL DEFAULT '',
    "ncm" TEXT NOT NULL,
    "ncmCandidatos" JSONB NOT NULL DEFAULT '[]',
    "pesoBrutoKg" DECIMAL(12,4),
    "pesoLiqKg" DECIMAL(12,4) NOT NULL,
    "qtd" DECIMAL(14,4),
    "fobUnitarioUS" DECIMAL(14,4),
    "fobTotalUS" DECIMAL(14,4) NOT NULL,
    "aliquotas" JSONB NOT NULL,
    "aliquotasOverride" BOOLEAN NOT NULL DEFAULT false,
    "benchmark" JSONB,
    "calibracao" JSONB,
    "risco" JSONB,
    "anuencia" JSONB NOT NULL DEFAULT '[]',
    "antidumping" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Despesa" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "valorBRL" DECIMAL(14,2) NOT NULL,
    "entraBaseSaida" BOOLEAN NOT NULL DEFAULT true,
    "entraBaseNota" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Despesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Cotacao_tenantId_criadoEm_idx" ON "Cotacao"("tenantId", "criadoEm" DESC);

-- CreateIndex
CREATE INDEX "Cotacao_tenantId_status_idx" ON "Cotacao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Cotacao_cliente_idx" ON "Cotacao"("cliente");

-- CreateIndex
CREATE INDEX "Item_cotacaoId_idx" ON "Item"("cotacaoId");

-- CreateIndex
CREATE INDEX "Item_ncm_idx" ON "Item"("ncm");

-- CreateIndex
CREATE INDEX "Despesa_cotacaoId_idx" ON "Despesa"("cotacaoId");

-- AddForeignKey
ALTER TABLE "Cotacao" ADD CONSTRAINT "Cotacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
