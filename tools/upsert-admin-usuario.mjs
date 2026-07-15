#!/usr/bin/env node
/**
 * Cria ou atualiza um usuário admin aprovado no banco (bootstrap / recuperação).
 *
 * Uso na VPS:
 *   set -a && source /etc/cia-alpha44/api.env && set +a
 *   node tools/upsert-admin-usuario.mjs feliciofc@gmail.com 'SuaSenha'
 *
 * Ou senha via env (evita histórico do shell):
 *   CIA_ADMIN_SENHA='...' node tools/upsert-admin-usuario.mjs feliciofc@gmail.com
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const emailArg = process.argv[2]?.trim().toLowerCase();
const senhaArg = process.argv[3] ?? process.env.CIA_ADMIN_SENHA;

if (!emailArg || !senhaArg) {
  console.error("Uso: node tools/upsert-admin-usuario.mjs <email> [senha]");
  console.error("  ou CIA_ADMIN_SENHA=... node tools/upsert-admin-usuario.mjs <email>");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL ausente — carregue /etc/cia-alpha44/api.env antes.");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const senhaHash = await bcrypt.hash(senhaArg, 12);
  const nome = emailArg.split("@")[0] || "Admin";

  const usuario = await prisma.usuario.upsert({
    where: { email: emailArg },
    create: {
      email: emailArg,
      senhaHash,
      nome,
      status: "aprovado",
      role: "admin",
      aprovadoEm: new Date(),
      aprovadoPor: "upsert-admin-usuario",
    },
    update: {
      senhaHash,
      nome,
      status: "aprovado",
      role: "admin",
      aprovadoEm: new Date(),
      aprovadoPor: "upsert-admin-usuario",
    },
  });

  console.log(`OK — ${usuario.email} (${usuario.role}, ${usuario.status})`);
} catch (e) {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
