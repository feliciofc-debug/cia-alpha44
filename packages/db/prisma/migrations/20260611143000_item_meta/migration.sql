-- Metadados estendidos do item (uso, material, ncmFonte, fobKgFonte, compatibilidade…)
ALTER TABLE "Item" ADD COLUMN "meta" JSONB NOT NULL DEFAULT '{}';
