#!/usr/bin/env node
/** Verifica se o bundle em produção tem o gate NCM estrutural (17fc4eb). */
const bases = [
  "https://cia-alpha44-web.vercel.app",
  "https://cia-alpha44.vercel.app",
];

for (const base of bases) {
  const html = await fetch(base, { signal: AbortSignal.timeout(15000) }).then((r) => r.text());
  const m = html.match(/index-([A-Za-z0-9_-]+)\.js/);
  if (!m) {
    console.log(base, "— bundle não encontrado");
    continue;
  }
  const js = await fetch(`${base}/assets/index-${m[1]}.js`, {
    signal: AbortSignal.timeout(30000),
  }).then((r) => r.text());

  const old = ["corrija ou confirme", "NCM inválido", "NCM invalido"];
  const neu = ["Informe o NCM de 8", "revisar:0", "00000000"];

  console.log(`\n${base}`);
  console.log("  bundle:", `index-${m[1]}.js`);
  console.log("  OLD (deve ser false):", old.map((s) => [s, js.includes(s)]));
  console.log("  NEW (deve ser true):", neu.map((s) => [s, js.includes(s)]));
  console.log(
    "  gate OK:",
    !old.some((s) => js.includes(s)) && neu.every((s) => js.includes(s)),
  );
}
