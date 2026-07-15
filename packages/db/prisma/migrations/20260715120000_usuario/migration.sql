-- CreateEnum
CREATE TYPE "UsuarioStatus" AS ENUM ('pendente', 'aprovado', 'bloqueado');

-- CreateEnum
CREATE TYPE "UsuarioRole" AS ENUM ('admin', 'operador');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" "UsuarioStatus" NOT NULL DEFAULT 'pendente',
    "role" "UsuarioRole" NOT NULL DEFAULT 'operador',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprovadoEm" TIMESTAMP(3),
    "aprovadoPor" TEXT,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
