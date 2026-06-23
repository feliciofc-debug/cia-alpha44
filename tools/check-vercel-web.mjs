#!/usr/bin/env node
const urls = ["https://cia-alpha44-web.vercel.app/", "https://cia-alpha44.vercel.app/"];
for (const u of urls) {
  try {
    const h = await fetch(u).then((r) => r.text());
    const m = h.match(/src="([^"]+\.js)"/);
    const jurl = m?.[1]?.startsWith("http") ? m[1] : new URL(m[1], u).href;
    const js = await fetch(jurl).then((r) => r.text());
    console.log(`\n=== ${u} ===`);
    console.log("bundle:", jurl.split("/").pop());
    console.log("planilha-cliente:", js.includes("planilha-cliente"));
    console.log("Planilha cliente (label):", js.includes("Planilha cliente"));
    console.log("planilha-cliente-familia:", js.includes("planilha-cliente-familia"));
    console.log("referencia IA:", /refer[eê]ncia IA/i.test(js));
  } catch (e) {
    console.log(`\n=== ${u} === ERRO:`, e.message);
  }
}
