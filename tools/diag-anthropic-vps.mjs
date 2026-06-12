import { readFileSync } from "node:fs";
import { limparChaveApi, criarChamadaAnthropic } from "../apps/api/dist/llm/llm-chamada.js";
import { buildTranslatePrompt, SYSTEM_TRANSLATE } from "../apps/api/dist/llm/prompt-2passes.js";

const envRaw = readFileSync("/etc/cia-alpha44/api.env", "utf8");
const line = envRaw.split(/\n/).find((l) => l.startsWith("ANTHROPIC_API_KEY="));
const fromFile = line?.split("=").slice(1).join("=") ?? "";
const fromProcess = process.env.ANTHROPIC_API_KEY ?? "";

function meta(label, val) {
  const clean = limparChaveApi(val);
  console.log(
    JSON.stringify({
      label,
      len: val.length,
      cleanLen: clean.length,
      prefix: clean.slice(0, 12),
      suffix: clean.slice(-4),
      hasCR: val.includes("\r"),
      hasLF: val.includes("\n"),
    }),
  );
}

meta("file", fromFile);
meta("process.env", fromProcess);

const raw = fromProcess || fromFile;
const llm = criarChamadaAnthropic(raw, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6");
try {
  const out = await llm(
    SYSTEM_TRANSLATE,
    buildTranslatePrompt([{ i: 0, descOriginal: "Parafusadeira sem fio 18V" }]),
  );
  console.log("ANTHROPIC_OK", out.slice(0, 150));
  process.exit(0);
} catch (e) {
  console.log("ANTHROPIC_ERR", e instanceof Error ? e.message.slice(0, 220) : String(e));
  process.exit(1);
}
