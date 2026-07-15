import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dir = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dir, "..");

function listarArquivosFonte(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) listarArquivosFonte(caminho, acc);
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

describe("front — sem dependência Clerk", () => {
  it("nenhum arquivo src importa @clerk", () => {
    const arquivos = listarArquivosFonte(join(WEB_ROOT, "src"));
    const offenders = arquivos.filter((f) => /@clerk\//.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("package.json não lista @clerk/clerk-react", () => {
    const pkg = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@clerk/clerk-react"]).toBeUndefined();
  });
});
