/**
 * POST /api/auth/login — email + senha → JWT próprio.
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { emitirToken, jwtConfigurado } from "./jwt.js";
import { ciaUsersConfigurados, validarCredenciais } from "./users.js";

const bodySchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

export async function registrarRotaLogin(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", async (req, reply) => {
    if (!jwtConfigurado()) {
      return reply.status(503).send({ erro: "Login indisponível — CIA_JWT_SECRET não configurado." });
    }
    if (!ciaUsersConfigurados()) {
      return reply.status(503).send({ erro: "Login indisponível — CIA_USERS não configurado." });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ erro: "E-mail e senha são obrigatórios." });
    }

    const email = await validarCredenciais(parsed.data.email, parsed.data.senha);
    if (!email) {
      return reply.status(401).send({ erro: "E-mail ou senha incorretos." });
    }

    const token = await emitirToken(email);
    return { token, email };
  });
}
