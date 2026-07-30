-- Tenant branding (white-label) — additive only.
ALTER TABLE "Tenant" ADD COLUMN "displayName" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "tagline" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "logoPath" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "logoMime" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "brandingAtualizadoEm" TIMESTAMP(3);

-- Branding explicitamente configurado para o tenant atual da INNOVE.
-- Não é fallback global: outros tenants sem logo continuam sem logo.
UPDATE "Tenant"
SET
  "displayName" = 'INNOVE 888',
  "tagline" = 'Gestão de trade',
  "logoPath" = 'builtin:logo-innove888.jpeg',
  "logoMime" = 'image/jpeg',
  "brandingAtualizadoEm" = CURRENT_TIMESTAMP
WHERE "slug" = 'user_paulo.mesquita@innove888.com.br';
