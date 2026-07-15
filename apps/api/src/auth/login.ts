/**
 * POST /api/auth/login — email + senha → JWT próprio.
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { emitirToken, jwtConfigurado } from "./jwt.js";
import { validarLogin } from "./usuario-db.js";

const bodySchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

export async function registrarRotaLogin(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", async (req, reply) => {
    if (!jwtConfigurado()) {
      return reply.status(503).send({ erro: "Login indisponível — CIA_JWT_SECRET não configurado." });
    }
    if (!process.env.DATABASE_URL?.trim()) {
      return reply.status(503).send({ erro: "Login indisponível — banco não configurado." });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ erro: "E-mail e senha são obrigatórios." });
    }

    const resultado = await validarLogin(parsed.data.email, parsed.data.senha);
    if (!resultado.ok) {
      if (resultado.motivo === "pendente") {
        return reply.status(403).send({ erro: "Aguardando aprovação do administrador." });
      }
      if (resultado.motivo === "bloqueado") {
        return reply.status(403).send({ erro: "Conta bloqueada — contate o administrador." });
      }
      return reply.status(401).send({ erro: "E-mail ou senha incorretos." });
    }

    const { usuario } = resultado;
    const token = await emitirToken({
      email: usuario.email,
      nome: usuario.nome,
      role: usuario.role,
    });
    return {
      token,
      email: usuario.email,
      nome: usuario.nome,
      role: usuario.role,
    };
  });
}
