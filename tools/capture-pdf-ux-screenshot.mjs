/**
 * Captura screenshots do fix UX PDF (login demo + cotação pendente).
 * Uso: node tools/capture-pdf-ux-screenshot.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, "..", "tools", "screenshots-pdf-ux");
const BASE = (process.argv[2] ?? "https://cia-alpha44.vercel.app").replace(/\/$/, "");
const DEMO_EMAIL = "demo@cia-alpha44.com.br";
const DEMO_PASSWORD = "CiaAlpha44!";

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', DEMO_EMAIL);
  await page.fill('input[type="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|$)/, { timeout: 30_000 }).catch(() => {});

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const cotacaoLink = page.locator("text=packliste-DE").first();
  if (await cotacaoLink.count()) {
    await cotacaoLink.click();
    await page.waitForTimeout(1500);
    await page.click("text=Ver orçamento cliente").catch(() => {});
    await page.waitForTimeout(1000);
    const btn = page.locator("text=Baixar PDF deste orçamento").first();
    await btn.click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "01-pendente-toast.png"), fullPage: true });
    const resolver = page.locator("text=Resolver pendências").first();
    if (await resolver.count()) {
      await resolver.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, "02-barra-resolucao.png"), fullPage: true });
    }
  }

  await browser.close();
  console.log("Screenshots em:", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
