#!/usr/bin/env node
import { readFileSync } from "node:fs";

const BASE = "https://cia-alpha44.vercel.app/";
const html = await fetch(BASE).then((r) => r.text());
const m = html.match(/src="([^"]+\.js)"/);
if (!m) {
  console.error("JS bundle não encontrado");
  process.exit(1);
}
const jsurl = m[1].startsWith("http") ? m[1] : new globalThis.URL(m[1], BASE).href;
const js = await fetch(jsurl).then((r) => r.text());
const needles = [
  "60e68d7",
  "referência IA",
  "Re-analisar NCM",
  "Salvar e recalcular fiscal",
  "sem-ncm-coluna",
];
for (const n of needles) {
  console.log(`${n}: ${js.includes(n) ? "SIM" : "não"}`);
}
console.log(`bundle: ${jsurl.split("/").pop()}`);
