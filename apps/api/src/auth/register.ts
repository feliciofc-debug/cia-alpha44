/**
 * POST /api/auth/register — autocadastro (status pendente).
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { jwtConfigurado } from "./jwt.js";
import { criarUsuarioPendente, EmailJaCadastradoError } from "./usuario-db.js";

const bodySchema = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  senha: z.string().min(8).max(128),
});

export async function registrarRotaRegister(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/register", async (req, reply) => {
    if (!jwtConfigurado()) {
      return reply.status(503).send({ erro: "Cadastro indisponível — CIA_JWT_SECRET não configurado." });
    }
    if (!process.env.DATABASE_URL?.trim()) {
      return reply.status(503).send({ erro: "Cadastro indisponível — banco não configurado." });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ erro: "Nome, e-mail e senha válidos são obrigatórios (senha mín. 8 caracteres)." });
    }

    try {
      await criarUsuarioPendente(parsed.data);
      return reply.status(201).send({
        ok: true,
        mensagem: "Cadastro enviado — aguarde aprovação do administrador.",
      });
    } catch (e) {
      if (e instanceof EmailJaCadastradoError) {
        return reply.status(409).send({ erro: e.message });
      }
      throw e;
    }
  });
}
