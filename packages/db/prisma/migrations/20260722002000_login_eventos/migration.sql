-- Auditoria de tentativas de login e último acesso do usuário.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LoginEventoMotivo') THEN
        CREATE TYPE "LoginEventoMotivo" AS ENUM ('ok', 'bloqueado', 'pendente', 'senha_errada');
    END IF;
END $$;

ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "ultimoLoginEm" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "LoginEvento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "email" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "motivo" "LoginEventoMotivo" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvento_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'LoginEvento_usuarioId_fkey'
    ) THEN
        ALTER TABLE "LoginEvento"
        ADD CONSTRAINT "LoginEvento_usuarioId_fkey"
        FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LoginEvento_criadoEm_idx" ON "LoginEvento"("criadoEm" DESC);
CREATE INDEX IF NOT EXISTS "LoginEvento_email_criadoEm_idx" ON "LoginEvento"("email", "criadoEm" DESC);
CREATE INDEX IF NOT EXISTS "LoginEvento_usuarioId_criadoEm_idx" ON "LoginEvento"("usuarioId", "criadoEm" DESC);
CREATE INDEX IF NOT EXISTS "LoginEvento_motivo_criadoEm_idx" ON "LoginEvento"("motivo", "criadoEm" DESC);
