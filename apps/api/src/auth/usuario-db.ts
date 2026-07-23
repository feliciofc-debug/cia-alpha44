/**
 * Usuários no banco — cadastro, login e administração.
 */

import bcrypt from "bcryptjs";
import {
  prisma,
  type LoginEvento,
  type LoginEventoMotivo,
  type Usuario,
  type UsuarioRole,
  type UsuarioStatus,
} from "@cia/db";

const BCRYPT_ROUNDS = 12;
const ADMIN_EMAIL_PADRAO = "feliciofc@gmail.com";

export type UsuarioPublico = Pick<
  Usuario,
  "id" | "email" | "nome" | "status" | "role" | "criadoEm" | "aprovadoEm" | "aprovadoPor" | "ultimoLoginEm"
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
    ultimoLoginEm: u.ultimoLoginEm,
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

export type LoginEventoPublico = Pick<
  LoginEvento,
  "id" | "usuarioId" | "email" | "sucesso" | "motivo" | "criadoEm"
>;

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function eventoParaPublico(e: LoginEvento): LoginEventoPublico {
  return {
    id: e.id,
    usuarioId: e.usuarioId,
    email: e.email,
    sucesso: e.sucesso,
    motivo: e.motivo,
    criadoEm: e.criadoEm,
  };
}

async function registrarLoginEvento(input: {
  usuario?: Usuario | null;
  email: string;
  sucesso: boolean;
  motivo: LoginEventoMotivo;
}): Promise<void> {
  await prisma.loginEvento.create({
    data: {
      usuarioId: input.usuario?.id ?? null,
      email: normalizarEmail(input.email),
      sucesso: input.sucesso,
      motivo: input.motivo,
    },
  });
}

export async function listarLoginEventos(opts?: { limite?: number; offset?: number }): Promise<{
  eventos: LoginEventoPublico[];
  total: number;
}> {
  const limite = Math.min(Math.max(opts?.limite ?? 20, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const [rows, total] = await Promise.all([
    prisma.loginEvento.findMany({
      orderBy: { criadoEm: "desc" },
      take: limite,
      skip: offset,
    }),
    prisma.loginEvento.count(),
  ]);
  return { eventos: rows.map(eventoParaPublico), total };
}

export async function contarLoginsBloqueadosRecentes(horas = 24): Promise<number> {
  const horasNormalizadas = Number.isFinite(horas) ? Math.min(Math.max(horas, 1), 24 * 30) : 24;
  const desde = new Date(Date.now() - horasNormalizadas * 60 * 60 * 1000);
  return prisma.loginEvento.count({
    where: {
      motivo: "bloqueado",
      criadoEm: { gte: desde },
    },
  });
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
  const emailNormalizado = normalizarEmail(email);
  const usuario = await buscarUsuarioPorEmail(emailNormalizado);
  if (!usuario) {
    await registrarLoginEvento({ email: emailNormalizado, sucesso: false, motivo: "senha_errada" });
    return { ok: false, motivo: "credenciais" };
  }
  if (usuario.status === "bloqueado") {
    await registrarLoginEvento({ usuario, email: emailNormalizado, sucesso: false, motivo: "bloqueado" });
    return { ok: false, motivo: "bloqueado" };
  }
  if (usuario.status === "pendente") {
    await registrarLoginEvento({ usuario, email: emailNormalizado, sucesso: false, motivo: "pendente" });
    return { ok: false, motivo: "pendente" };
  }
  const senhaOk = await bcrypt.compare(senha, usuario.senhaHash);
  if (!senhaOk) {
    await registrarLoginEvento({ usuario, email: emailNormalizado, sucesso: false, motivo: "senha_errada" });
    return { ok: false, motivo: "credenciais" };
  }
  const agora = new Date();
  const [atualizado] = await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLoginEm: agora },
    }),
    prisma.loginEvento.create({
      data: {
        usuarioId: usuario.id,
        email: emailNormalizado,
        sucesso: true,
        motivo: "ok",
        criadoEm: agora,
      },
    }),
  ]);
  return { ok: true, usuario: atualizado };
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
