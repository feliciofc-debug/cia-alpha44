#!/usr/bin/env node
/**
 * Diagnostico seguro de login no banco.
 *
 * Uso na VPS:
 *   cd /opt/cia-alpha44
 *   set -a && source /etc/cia-alpha44/api.env && set +a
 *   node tools/diag-login-usuario.mjs feliciofc@gmail.com
 *
 * Opcional, para confirmar senha sem imprimir segredo:
 *   CIA_LOGIN_SENHA='senha' node tools/diag-login-usuario.mjs feliciofc@gmail.com
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
const senha = process.env.CIA_LOGIN_SENHA;

if (!email) {
  console.error("Uso: node tools/diag-login-usuario.mjs <email>");
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL ausente — carregue /etc/cia-alpha44/api.env antes.");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) {
    console.log(JSON.stringify({ email, existe: false, senhaConferida: Boolean(senha) }, null, 2));
    process.exit(0);
  }

  const senhaConfere = senha ? await bcrypt.compare(senha, usuario.senhaHash) : null;
  console.log(
    JSON.stringify(
      {
        email: usuario.email,
        existe: true,
        nome: usuario.nome,
        status: usuario.status,
        role: usuario.role,
        ultimoLoginEm: usuario.ultimoLoginEm,
        criadoEm: usuario.criadoEm,
        aprovadoEm: usuario.aprovadoEm,
        aprovadoPor: usuario.aprovadoPor,
        senhaConferida: Boolean(senha),
        senhaConfere,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
