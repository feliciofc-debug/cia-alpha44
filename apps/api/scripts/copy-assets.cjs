const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const src = path.join(__dirname, "..", "src", "assets");
const dest = path.join(__dirname, "..", "dist", "assets");

const FONT_NAME = "NotoSansCJKsc-Regular.otf";
const FONT_URL =
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf";

function baixar(url, destino) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destino);
    const req = https.get(
      url,
      { headers: { "User-Agent": "cia-alpha44-build", Accept: "*/*" } },
      (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          file.close();
          fs.unlinkSync(destino);
          return baixar(res.headers.location, destino).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(destino, () => {});
          reject(new Error(`HTTP ${res.statusCode} ao baixar fonte`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      },
    );
    req.on("error", reject);
  });
}

async function garantirFonteUnicode(dir) {
  const alvo = path.join(dir, FONT_NAME);
  if (fs.existsSync(alvo) && fs.statSync(alvo).size > 1_000_000) return;
  fs.mkdirSync(dir, { recursive: true });
  console.log(">> Baixando fonte Noto Sans SC para PDF...");
  try {
    await baixar(FONT_URL, alvo);
  } catch (e) {
    console.warn("   Aviso: fonte Unicode não baixada — cabeçalho CJK pode falhar no PDF.", e.message);
  }
}

async function main() {
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  await garantirFonteUnicode(src);
  await garantirFonteUnicode(dest);

  for (const f of fs.readdirSync(src)) {
    if (f.endsWith(".png") && f.includes("preview")) continue;
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
  console.log("assets copiados para dist/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
