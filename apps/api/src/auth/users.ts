/**
 * Parser legado CIA_USERS — usado apenas no seed de migração inicial.
 * Login/cadastro usam tabela Usuario no banco.
 */

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
