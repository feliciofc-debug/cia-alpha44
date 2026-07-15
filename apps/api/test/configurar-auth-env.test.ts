import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import {
  aplicarAuthEnv,
  extrairAuthEnv,
  formatarRelatorioValidacao,
  gerarJwtSecret,
  hashBcryptValido,
  jwtSecretInvalido,
  parseCiaUsers,
  removerLinhasAuth,
  serializarCiaUsers,
  validarAuthEnv,
} from "../../tools/lib/auth-env.mjs";

const ENV_EXEMPLO = `NODE_ENV=production
WEB_ORIGIN=https://cia-alpha44.vercel.app
CIA_JWT_SECRET=SEGREDO_DO_PASSO_2
CIA_USERS=felicio@test.com:SENHA_DO_FELICIO
CIA_API_KEY=abc123
CIA_JWT_SECRET=duplicado
`;

describe("auth-env — parser e gravador", () => {
  it("detecta placeholders inválidos", () => {
    expect(jwtSecretInvalido("SEGREDO_DO_PASSO_2")).toBe(true);
    expect(jwtSecretInvalido("SENHA_DO_FELICIO")).toBe(true);
    expect(hashBcryptValido("SENHA_DO_FELICIO")).toBe(false);

    const valido = gerarJwtSecret();
    expect(jwtSecretInvalido(valido)).toBe(false);
    expect(valido).toHaveLength(64);
  });

  it("remove linhas CIA_JWT_SECRET e CIA_USERS (inclusive duplicadas)", () => {
    const limpo = removerLinhasAuth(ENV_EXEMPLO);
    expect(limpo).not.toMatch(/CIA_JWT_SECRET/);
    expect(limpo).not.toMatch(/CIA_USERS/);
    expect(limpo).toContain("WEB_ORIGIN=");
    expect(limpo).toContain("CIA_API_KEY=");
  });

  it("aplica auth limpo com um único par jwt/users", async () => {
    const hash = await bcrypt.hash("senha-teste", 4);
    const users = new Map([["ops@cia.com.br", hash]]);
    const jwt = gerarJwtSecret();

    const out = aplicarAuthEnv(ENV_EXEMPLO, { jwtSecret: jwt, users });
    const val = validarAuthEnv(out);

    expect(val.ok).toBe(true);
    expect(val.resumo.totalUsuarios).toBe(1);
    expect(val.resumo.emails).toEqual(["ops@cia.com.br"]);
    expect(out.split("\n").filter((l) => l.startsWith("CIA_JWT_SECRET="))).toHaveLength(1);
    expect(out.split("\n").filter((l) => l.startsWith("CIA_USERS="))).toHaveLength(1);
  });

  it("parse e serialização round-trip", async () => {
    const hash = await bcrypt.hash("x", 4);
    const map = new Map([
      ["a@b.com", hash],
      ["c@d.com", hash],
    ]);
    const raw = serializarCiaUsers(map);
    const parsed = parseCiaUsers(raw);
    expect([...parsed.keys()].sort()).toEqual(["a@b.com", "c@d.com"]);
    expect(hashBcryptValido(hash)).toBe(true);
  });

  it("extrairAuthEnv lê estado placeholder atual", () => {
    const ext = extrairAuthEnv(ENV_EXEMPLO);
    expect(ext.jwtSecret).toBe("SEGREDO_DO_PASSO_2");
    expect(ext.users.get("felicio@test.com")).toBe("SENHA_DO_FELICIO");
    expect(jwtSecretInvalido(ext.jwtSecret)).toBe(true);
  });

  it("validação falha em env com placeholders", () => {
    const val = validarAuthEnv(ENV_EXEMPLO);
    expect(val.ok).toBe(false);
    expect(val.erros.some((e) => /placeholder|inválido|exatamente 1 vez/i.test(e))).toBe(true);
    const rel = formatarRelatorioValidacao(val);
    expect(rel).toContain("validate-api-env");
    expect(rel).not.toContain("SENHA_DO_FELICIO");
  });
});
