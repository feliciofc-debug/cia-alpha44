/**
 * Usuários no banco — cadastro, login e administração.
 */

import bcrypt from "bcryptjs";
import { prisma, type Usuario, type UsuarioRole, type UsuarioStatus } from "@cia/db";

const BCRYPT_ROUNDS = 12;
const ADMIN_EMAIL_PADRAO = "feliciofc@gmail.com";

export type UsuarioPublico = Pick<
  Usuario,
  "id" | "email" | "nome" | "status" | "role" | "criadoEm" | "aprovadoEm" | "aprovadoPor"
>;

export function usuarioParaPublico(u: Usuario): UsuarioPublico {
  return {
    id: u.id,
    email: u.email,
    nome: u.nome,
    status: u.status,
    role: u.role,
    criadoEm: u.criadoEm,
    aprovadoEm: u.aprovadoEm,
    aprovadoPor: u.aprovadoPor,
  };
}

export async function buscarUsuarioPorEmail(email: string): Promise<Usuario | null> {
  const normalizado = email.trim().toLowerCase();
  return prisma.usuario.findUnique({ where: { email: normalizado } });
}

export async function listarUsuarios(): Promise<UsuarioPublico[]> {
  const rows = await prisma.usuario.findMany({ orderBy: [{ status: "asc" }, { criadoEm: "desc" }] });
  return rows.map(usuarioParaPublico);
}

export async function contarUsuariosPendentes(): Promise<number> {
  return prisma.usuario.count({ where: { status: "pendente" } });
}

export async function criarUsuarioPendente(dados: {
  nome: string;
  email: string;
  senha: string;
}): Promise<UsuarioPublico> {
  const email = dados.email.trim().toLowerCase();
  const nome = dados.nome.trim();
  const existente = await buscarUsuarioPorEmail(email);
  if (existente) {
    throw new EmailJaCadastradoError();
  }
  const senhaHash = await bcrypt.hash(dados.senha, BCRYPT_ROUNDS);
  const criado = await prisma.usuario.create({
    data: { email, nome, senhaHash, status: "pendente", role: "operador" },
  });
  return usuarioParaPublico(criado);
}

export class EmailJaCadastradoError extends Error {
  constructor() {
    super("E-mail já cadastrado.");
    this.name = "EmailJaCadastradoError";
  }
}

export type ResultadoLogin =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: "credenciais" | "pendente" | "bloqueado" };

export async function validarLogin(email: string, senha: string): Promise<ResultadoLogin> {
  const usuario = await buscarUsuarioPorEmail(email);
  if (!usuario) return { ok: false, motivo: "credenciais" };
  const senhaOk = await bcrypt.compare(senha, usuario.senhaHash);
  if (!senhaOk) return { ok: false, motivo: "credenciais" };
  if (usuario.status === "pendente") return { ok: false, motivo: "pendente" };
  if (usuario.status === "bloqueado") return { ok: false, motivo: "bloqueado" };
  return { ok: true, usuario };
}

export async function aprovarUsuario(id: string, adminEmail: string): Promise<UsuarioPublico | null> {
  try {
    const atualizado = await prisma.usuario.update({
      where: { id },
      data: {
        status: "aprovado" satisfies UsuarioStatus,
        aprovadoEm: new Date(),
        aprovadoPor: adminEmail.trim().toLowerCase(),
      },
    });
    return usuarioParaPublico(atualizado);
  } catch {
    return null;
  }
}

export async function bloquearUsuario(id: string): Promise<UsuarioPublico | null> {
  try {
    const atualizado = await prisma.usuario.update({
      where: { id },
      data: { status: "bloqueado" satisfies UsuarioStatus },
    });
    return usuarioParaPublico(atualizado);
  } catch {
    return null;
  }
}

export async function usuarioEhAdmin(email: string): Promise<boolean> {
  const u = await buscarUsuarioPorEmail(email);
  return u?.status === "aprovado" && u.role === "admin";
}

export function emailAdminPadrao(): string {
  return ADMIN_EMAIL_PADRAO;
}

export function roleParaSeed(email: string): UsuarioRole {
  return email.trim().toLowerCase() === ADMIN_EMAIL_PADRAO ? "admin" : "operador";
}
