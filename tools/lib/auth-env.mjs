/**
 * Parser/gravador de CIA_JWT_SECRET e CIA_USERS em api.env — funções puras (testáveis).
 */

import { randomBytes } from "node:crypto";

const RE_LINHA_JWT = /^\s*CIA_JWT_SECRET\s*=/;
const RE_LINHA_USERS = /^\s*CIA_USERS\s*=/;

const PLACEHOLDER_JWT =
  /PLACEHOLDER|SEGREDO_DO|PASSO_\d|HASH\d|SENHA_DO|EXEMPLO|CHANGEME|TODO|TROCAR/i;

export function parseCiaUsers(raw) {
  const map = new Map();
  const texto = raw?.trim();
  if (!texto) return map;

  for (const entry of texto.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) continue;
    const email = trimmed.slice(0, sep).trim().toLowerCase();
    const hash = trimmed.slice(sep + 1).trim();
    if (email && hash) map.set(email, hash);
  }
  return map;
}

export function serializarCiaUsers(users) {
  return [...users.entries()]
    .map(([email, hash]) => `${email}:${hash}`)
    .join(",");
}

export function extrairValorEnv(conteudo, chave) {
  const re = new RegExp(`^\\s*${chave}\\s*=\\s*(.*)$`, "m");
  const m = re.exec(conteudo);
  if (!m?.[1]) return undefined;
  return m[1].trim();
}

export function extrairAuthEnv(conteudo) {
  const ciaUsersRaw = extrairValorEnv(conteudo, "CIA_USERS");
  return {
    jwtSecret: extrairValorEnv(conteudo, "CIA_JWT_SECRET"),
    ciaUsersRaw,
    users: parseCiaUsers(ciaUsersRaw),
  };
}

export function jwtSecretInvalido(secret) {
  const s = secret?.trim() ?? "";
  if (s.length < 32) return true;
  if (PLACEHOLDER_JWT.test(s)) return true;
  return false;
}

export function hashBcryptValido(hash) {
  const h = hash?.trim() ?? "";
  if (!/^\$2[aby]\$\d{2}\$/.test(h)) return false;
  if (PLACEHOLDER_JWT.test(h)) return false;
  if (/^SENHA_DO_/i.test(h)) return false;
  return h.length >= 50;
}

export function removerLinhasAuth(conteudo) {
  return conteudo
    .split("\n")
    .filter((linha) => !RE_LINHA_JWT.test(linha) && !RE_LINHA_USERS.test(linha))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "")
    .concat("\n");
}

export function inserirLinhasAuth(conteudo, { jwtSecret, ciaUsers }) {
  const base = conteudo.endsWith("\n") ? conteudo : `${conteudo}\n`;
  return `${base}CIA_JWT_SECRET=${jwtSecret}\nCIA_USERS=${ciaUsers}\n`;
}

export function aplicarAuthEnv(conteudo, { jwtSecret, users }) {
  const limpo = removerLinhasAuth(conteudo);
  return inserirLinhasAuth(limpo, {
    jwtSecret,
    ciaUsers: serializarCiaUsers(users),
  });
}

export function gerarJwtSecret() {
  return randomBytes(32).toString("hex");
}

export function validarAuthEnv(conteudo) {
  const erros = [];
  const jwt = extrairValorEnv(conteudo, "CIA_JWT_SECRET");
  const usersRaw = extrairValorEnv(conteudo, "CIA_USERS");
  const users = parseCiaUsers(usersRaw);

  if (!jwt || jwtSecretInvalido(jwt)) {
    erros.push("CIA_JWT_SECRET ausente, curto demais ou placeholder inválido");
  }

  if (users.size === 0) {
    erros.push("CIA_USERS vazio ou sem entradas válidas");
  }

  for (const [email, hash] of users) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      erros.push(`email inválido: ${email}`);
    }
    if (!hashBcryptValido(hash)) {
      erros.push(`hash bcrypt inválido para ${email}`);
    }
  }

  const linhasJwt = conteudo.split("\n").filter((l) => RE_LINHA_JWT.test(l));
  const linhasUsers = conteudo.split("\n").filter((l) => RE_LINHA_USERS.test(l));
  if (linhasJwt.length !== 1) {
    erros.push(`CIA_JWT_SECRET deve aparecer exatamente 1 vez (tem ${linhasJwt.length})`);
  }
  if (linhasUsers.length !== 1) {
    erros.push(`CIA_USERS deve aparecer exatamente 1 vez (tem ${linhasUsers.length})`);
  }

  const crlf = (conteudo.match(/\r/g) ?? []).length;

  return {
    ok: erros.length === 0,
    erros,
    resumo: {
      jwtConfigurado: Boolean(jwt && !jwtSecretInvalido(jwt)),
      jwtTamanho: jwt?.length ?? 0,
      totalUsuarios: users.size,
      emails: [...users.keys()],
      crlf,
    },
  };
}

export function formatarRelatorioValidacao(validacao) {
  const linhas = ["=== validate-api-env (auth) ==="];
  linhas.push(`CIA_JWT_SECRET definido: ${validacao.resumo.jwtConfigurado ? 1 : 0}`);
  linhas.push(`CIA_JWT_SECRET tamanho: ${validacao.resumo.jwtTamanho}`);
  linhas.push(`CIA_USERS entradas: ${validacao.resumo.totalUsuarios}`);
  linhas.push(`Emails: ${validacao.resumo.emails.join(", ") || "(nenhum)"}`);
  linhas.push(`CRLF count: ${validacao.resumo.crlf}`);
  if (!validacao.ok) {
    linhas.push("ERROS:");
    for (const e of validacao.erros) linhas.push(`  - ${e}`);
  }
  return linhas.join("\n");
}
