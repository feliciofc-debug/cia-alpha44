#!/usr/bin/env node
/** PASSO 0 — egress Lovable (rodar na VPS ou local). */
const SUGERIR =
  process.env.NCM_HELPER_SUGERIR_URL ??
  `${(process.env.NCM_HELPER_BASE_URL ?? "https://ncm-helper-ai.lovable.app").replace(/\/$/, "")}/api/public/sugerir-ncm`;
const LOOKUP =
  process.env.NCM_HELPER_LOOKUP_URL ??
  `${(process.env.NCM_HELPER_BASE_URL ?? "https://ncm-helper-ai.lovable.app").replace(/\/$/, "")}/api/public/lookup-ncm`;

async function probe(name, url, body) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const ct = r.headers.get("content-type") ?? "";
    const text = await r.text();
    console.log(`\n=== ${name} ===`);
    console.log("URL:", url);
    console.log("Status:", r.status, ct.includes("json") ? "JSON" : "non-JSON");
    console.log(text.slice(0, 500));
    return r.status;
  } catch (e) {
    console.log(`\n=== ${name} FAIL ===`, e instanceof Error ? e.message : e);
    return 0;
  }
}

const s = await probe("sugerir-ncm", SUGERIR, {
  descricao: "erva mate 1 kg",
  material: null,
  uso: null,
  ncmAtual: "21012010",
  max: 4,
});
const l = await probe("lookup-ncm", LOOKUP, { ncm: "84713012" });

if (s !== 200) console.error("\nWARN: sugerir-ncm não retornou 200");
if (l === 404) console.error("\nWARN: lookup-ncm 404 — republish na Lovable (CIA usa fallback catálogo)");
