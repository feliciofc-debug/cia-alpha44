#!/usr/bin/env node
/** Gera screenshot estático da barra de resolução NCM (prova UX). */
import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const out = join(__dir, "proof-resolucao-ncm.html");

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<script src="https://cdn.tailwindcss.com"></script>
<title>Prova — Barra Resolução NCM</title>
</head>
<body class="bg-slate-950 p-6 text-white font-sans">
  <h1 class="mb-4 text-lg font-bold text-emerald-400">CIA Alpha 44 — Barra de resolução NCM (prova UX)</h1>
  <p class="mb-6 text-sm text-slate-400">Cotação cmqawtqj · fatura-92 · 11 itens pendentes</p>
  <button type="button" class="mb-4 w-full rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-left text-sm text-red-200">
    PDF bloqueado: 11 item(ns) pendente(s) de revisão NCM
    <span class="mt-1 block text-xs font-semibold text-red-100 underline">Clique para resolver →</span>
  </button>
  <div id="barra-resolucao-ncm" class="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 shadow-lg">
    <button type="button" class="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white">▶ Resolver pendências (11)</button>
    <ul class="mt-4 space-y-3">
      <li class="rounded-lg border border-white/15 bg-slate-900/80 p-3">
        <p class="text-xs text-slate-400">Item #1</p>
        <p class="font-medium">Patinete elétrico T1 MAX</p>
        <p class="text-xs text-amber-300">◐ Revisar compatibilidade</p>
        <p class="text-xs text-slate-400">NCM: <span class="font-mono text-emerald-300">8711.60.00</span></p>
        <button type="button" class="mt-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Confirmar NCM</button>
      </li>
      <li class="rounded-lg border border-white/15 bg-slate-900/80 p-3">
        <p class="text-xs text-slate-400">Item #2</p>
        <p class="font-medium">Peça ACC-ES freio</p>
        <p class="text-xs text-amber-300">◐ Revisar compatibilidade</p>
        <button type="button" class="mt-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Confirmar NCM</button>
      </li>
    </ul>
  </div>
</body>
</html>`;

writeFileSync(out, html, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
await page.goto("file:///" + out.replace(/\\/g, "/"));
await page.screenshot({ path: join(__dir, "proof-resolucao-ncm.png"), fullPage: true });
await browser.close();
console.log("Screenshot:", join(__dir, "proof-resolucao-ncm.png"));
