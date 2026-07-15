/**
 * Usuários locais — CIA_USERS="email:hashBcrypt,email2:hash2"
 */

import bcrypt from "bcryptjs";

export function parseCiaUsers(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
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

export function ciaUsersConfigurados(): boolean {
  return parseCiaUsers(process.env.CIA_USERS).size > 0;
}

export async function validarCredenciais(email: string, senha: string): Promise<string | null> {
  const normalizado = email.trim().toLowerCase();
  const hash = parseCiaUsers(process.env.CIA_USERS).get(normalizado);
  if (!hash) return null;
  const ok = await bcrypt.compare(senha, hash);
  return ok ? normalizado : null;
}
