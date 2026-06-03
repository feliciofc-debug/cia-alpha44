// Copia src/data -> dist/data após o tsc (tsc não emite arquivos não-TS).
const fs = require("node:fs");
const path = require("node:path");

const src = path.join(__dirname, "..", "src", "data");
const dest = path.join(__dirname, "..", "dist", "data");

if (!fs.existsSync(src)) process.exit(0);
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
console.log("data copiado para dist/");
