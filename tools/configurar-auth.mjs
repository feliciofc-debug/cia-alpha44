#!/usr/bin/env node
/**
 * Assistente interativo — configura CIA_JWT_SECRET e CIA_USERS em api.env (VPS).
 *
 * Uso na VPS (como root ou com permissão de escrita):
 *   cd /opt/cia-alpha44 && node tools/configurar-auth.mjs
 *
 * Variáveis:
 *   CIA_AUTH_ENV_FILE — caminho do env (padrão: /etc/cia-alpha44/api.env)
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
import {
  aplicarAuthEnv,
  extrairAuthEnv,
  formatarRelatorioValidacao,
  gerarJwtSecret,
  hashBcryptValido,
  jwtSecretInvalido,
  validarAuthEnv,
} from "./lib/auth-env.mjs";

const ENV_PATH = process.env.CIA_AUTH_ENV_FILE?.trim() || "/etc/cia-alpha44/api.env";

function pergunta(texto) {
  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => {
    rl.question(texto, (resposta) => {
      rl.close();
      resolve(resposta.trim());
    });
  });
}

function perguntaSenhaOculta(prompt) {
  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let senha = "";
    const onData = (char) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(senha);
        return;
      }
      if (char === "\u0003") {
        stdout.write("\n");
        process.exit(130);
      }
      if (char === "\u007f" || char === "\b") {
        senha = senha.slice(0, -1);
        return;
      }
      senha += char;
    };

    stdin.on("data", onData);
  });
}

function usuariosValidosExistentes(users) {
  const out = new Map();
  for (const [email, hash] of users) {
    if (hashBcryptValido(hash)) out.set(email, hash);
  }
  return out;
}

async function coletarUsuarios(usersIniciais) {
  const users = new Map(usersIniciais);

  console.log("\nCadastro de usuários (email + senha). Deixe email vazio para terminar.\n");

  while (true) {
    const email = await pergunta("Email do usuário (vazio para terminar): ");
    if (!email) break;

    const normalizado = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) {
      console.log("  → email inválido, tente novamente.");
      continue;
    }

    const senha = await perguntaSenhaOculta("Senha: ");
    if (!senha) {
      console.log("  → senha vazia, ignorado.");
      continue;
    }

    const hash = await bcrypt.hash(senha, 12);
    const acao = users.has(normalizado) ? "atualizado" : "adicionado";
    users.set(normalizado, hash);
    console.log(`  → ${normalizado} ${acao}.`);
  }

  return users;
}

async function main() {
  console.log("=== CIA / Alpha 44 — configurar autenticação ===\n");
  console.log(`Arquivo: ${ENV_PATH}\n`);

  if (!existsSync(ENV_PATH)) {
    console.error(`ERRO: arquivo não encontrado: ${ENV_PATH}`);
    console.error("Crie o api.env ou defina CIA_AUTH_ENV_FILE com o caminho correto.");
    process.exit(1);
  }

  const conteudoAtual = readFileSync(ENV_PATH, "utf8");
  const antes = extrairAuthEnv(conteudoAtual);
  const validosAntes = usuariosValidosExistentes(antes.users);

  let users = new Map();

  if (validosAntes.size > 0) {
    console.log("Usuários com hash válido no env atual:");
    for (const email of validosAntes.keys()) console.log(`  • ${email}`);
    const manter = await pergunta("\nManter estes emails (senhas atuais)? [S/n]: ");
    if (manter.toLowerCase() !== "n") {
      users = new Map(validosAntes);
    }
  } else if (antes.users.size > 0) {
    console.log("⚠ Encontradas entradas CIA_USERS inválidas/placeholder — serão descartadas.\n");
  }

  if (antes.jwtSecret && jwtSecretInvalido(antes.jwtSecret)) {
    console.log("⚠ CIA_JWT_SECRET atual é placeholder/inválido — será substituído.\n");
  }

  let jwtSecret;
  const jwtAnteriorValido = antes.jwtSecret && !jwtSecretInvalido(antes.jwtSecret);
  if (jwtAnteriorValido) {
    const regen = await pergunta("Gerar novo CIA_JWT_SECRET? (invalida sessões ativas) [s/N]: ");
    jwtSecret = regen.toLowerCase() === "s" ? gerarJwtSecret() : antes.jwtSecret;
  } else {
    jwtSecret = gerarJwtSecret();
    console.log("CIA_JWT_SECRET gerado automaticamente (64 hex).\n");
  }

  users = await coletarUsuarios(users);

  if (users.size === 0) {
    console.error("\nERRO: nenhum usuário cadastrado. Abortando sem gravar.");
    process.exit(1);
  }

  const novoConteudo = aplicarAuthEnv(conteudoAtual, { jwtSecret, users });
  const validacao = validarAuthEnv(novoConteudo);

  console.log("\n" + formatarRelatorioValidacao(validacao));
  if (!validacao.ok) {
    console.error("\nERRO: validação falhou. Nada foi gravado.");
    process.exit(1);
  }

  console.log("\n--- Resumo ---");
  console.log(`Emails cadastrados (${users.size}): ${[...users.keys()].join(", ")}`);
  console.log(`CIA_JWT_SECRET: ${jwtSecret.length} caracteres (valor não exibido)`);
  console.log("Senhas e hashes bcrypt não são exibidos por segurança.\n");

  const confirma = await pergunta(`Gravar alterações em ${ENV_PATH}? [S/n]: `);
  if (confirma.toLowerCase() === "n") {
    console.log("Cancelado — nenhuma alteração gravada.");
    process.exit(0);
  }

  writeFileSync(ENV_PATH, novoConteudo, "utf8");
  console.log("\n✓ api.env atualizado.");

  const restart = await pergunta("Reiniciar cia-api agora (systemctl restart cia-api)? [s/N]: ");
  if (restart.toLowerCase() === "s") {
    const r = spawnSync("systemctl", ["restart", "cia-api"], { stdio: "inherit" });
    if (r.status !== 0) {
      console.error("systemctl restart falhou — reinicie manualmente: systemctl restart cia-api");
      process.exit(r.status ?? 1);
    }
    console.log("✓ cia-api reiniciado.");
  } else {
    console.log("Lembrete: reinicie a API para aplicar — systemctl restart cia-api");
  }

  console.log("\nPronto. Faça login no front com um dos emails cadastrados.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
