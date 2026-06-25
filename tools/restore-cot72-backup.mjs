#!/usr/bin/env node
/**
 * Restaura a cotação 72 a partir do SQL gerado por backup-cot72-producao.mjs.
 *
 * Proteções:
 * - exige --apply;
 * - exige --confirm-cotacao <id>;
 * - exige DATABASE_URL;
 * - por padrão só imprime o comando.
 *
 * Uso real (somente com autorização humana):
 *   source /etc/cia-alpha44/api.env
 *   node tools/restore-cot72-backup.mjs /tmp/cot72-backup/manifest.json \
 *     --apply --confirm-cotacao cmqlfuhvm000ykw2cue1whldj
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const manifestPath = process.argv[2] ?? process.env.COT72_BACKUP_MANIFEST;
const apply = process.argv.includes("--apply");
const confirmIdx = process.argv.indexOf("--confirm-cotacao");
const confirmCotacao = confirmIdx >= 0 ? process.argv[confirmIdx + 1] : "";

if (!manifestPath) {
  console.error("Informe o manifest do backup.");
  process.exit(1);
}
if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL ausente.");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (confirmCotacao !== manifest.cotacaoId) {
  console.error(`Confirmação inválida. Use: --confirm-cotacao ${manifest.cotacaoId}`);
  process.exit(1);
}

const sqlPath = manifest.paths.restoreSql;
console.log(`Rollback cotação: ${manifest.cotacaoId}`);
console.log(`SQL: ${sqlPath}`);

if (!apply) {
  console.log("\nDRY-RUN: nada executado. Para aplicar, adicione --apply.");
  console.log(`Comando: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ${sqlPath}`);
  process.exit(0);
}

const r = spawnSync("psql", [process.env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", sqlPath], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
