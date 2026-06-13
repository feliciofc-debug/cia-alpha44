-- P3b: cache determinístico de classificação NCM (2 passes)
CREATE TABLE "ClassificacaoCache" (
    "chave" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "resultado" JSONB NOT NULL,
    "confirmadoHumano" BOOLEAN NOT NULL DEFAULT false,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassificacaoCache_pkey" PRIMARY KEY ("chave")
);

CREATE INDEX "ClassificacaoCache_promptVersion_catalogVersion_idx" ON "ClassificacaoCache"("promptVersion", "catalogVersion");
