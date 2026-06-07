const fs = require("node:fs");
const path = require("node:path");

const src = path.join(__dirname, "..", "src", "assets");
const dest = path.join(__dirname, "..", "dist", "assets");

if (!fs.existsSync(src)) process.exit(0);
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) {
  if (f.endsWith(".png") && f.includes("preview")) continue;
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
console.log("assets copiados para dist/");
