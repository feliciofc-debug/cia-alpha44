import { criarChamadaAnthropic } from "../apps/api/dist/llm/llm-chamada.js";
import { buildTranslatePrompt, SYSTEM_TRANSLATE, parseTranslateResponse } from "../apps/api/dist/llm/prompt-2passes.js";

const chamarLlm = criarChamadaAnthropic(process.env.ANTHROPIC_API_KEY ?? "", process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6");
try {
  const out = await chamarLlm(
    SYSTEM_TRANSLATE,
    buildTranslatePrompt([{ i: 0, descOriginal: "DE-WZ-1001 — Akku-Bohrschrauber 18V mit 2 Akkus und Koffer" }]),
  );
  console.log("STATUS ok");
  console.log("RAW:", out.slice(0, 600));
  console.log("PARSED:", parseTranslateResponse(out, 1));
} catch (e) {
  console.error("ERR:", e instanceof Error ? e.message : e);
}
