/**
 * Rotas admin — listar/aprovar/bloquear usuários.
 */

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  aprovarUsuario,
  bloquearUsuario,
  contarUsuariosPendentes,
  listarUsuarios,
  usuarioEhAdmin,
} from "./usuario-db.js";

async function exigirAdmin(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const email = req.auth?.userId;
  if (!email || email === "apikey" || email === "demo") {
    await reply.status(403).send({ erro: "Acesso restrito a administradores." });
    return false;
  }
  const admin = await usuarioEhAdmin(email);
  if (!admin) {
    await reply.status(403).send({ erro: "Acesso restrito a administradores." });
    return false;
  }
  return true;
}

const patchSchema = z.object({
  acao: z.enum(["aprovar", "bloquear"]),
});

export async function registrarRotasAdminUsuarios(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/usuarios", async (req, reply) => {
    if (!(await exigirAdmin(req, reply))) return;
    const [usuarios, pendentes] = await Promise.all([listarUsuarios(), contarUsuariosPendentes()]);
    return { usuarios, pendentes };
  });

  app.get("/api/admin/usuarios/pendentes-count", async (req, reply) => {
    if (!(await exigirAdmin(req, reply))) return;
    const pendentes = await contarUsuariosPendentes();
    return { pendentes };
  });

  app.patch("/api/admin/usuarios/:id", async (req, reply) => {
    if (!(await exigirAdmin(req, reply))) return;

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ erro: "Ação inválida — use aprovar ou bloquear." });
    }

    const id = (req.params as { id?: string }).id?.trim();
    if (!id) return reply.status(400).send({ erro: "ID do usuário é obrigatório." });

    const adminEmail = req.auth!.userId;
    const usuario =
      parsed.data.acao === "aprovar"
        ? await aprovarUsuario(id, adminEmail)
        : await bloquearUsuario(id);

    if (!usuario) {
      return reply.status(404).send({ erro: "Usuário não encontrado." });
    }

    const pendentes = await contarUsuariosPendentes();
    return { usuario, pendentes };
  });
}
