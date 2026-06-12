import { describe, expect, it } from "vitest";
import { criarNcmCatalog, listarNcm8DaPosicao, loadNcmVigente } from "@cia/pipeline";
import {
  AVISO_TRADUCAO_INDISPONIVEL,
  executar2PassesComLlm,
} from "../src/llm/classificar-ncm-2passes.js";
import {
  SYSTEM_PASSE1,
  SYSTEM_PASSE2,
  SYSTEM_TRANSLATE,
} from "../src/llm/prompt-2passes.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("executar2PassesComLlm — falha de tradução", () => {
  it("timeout na tradução DE usa heurística mock + aviso, classifica item", async () => {
    const chamarLlm = async (system: string, _user: string) => {
      if (system === SYSTEM_TRANSLATE) throw new Error("timeout");
      if (system === SYSTEM_PASSE1) {
        return JSON.stringify({
          itens: [{ i: 0, posicao4: "8467", confianca: 0.9, justificativaRGI: "RGI 1" }],
        });
      }
      if (system === SYSTEM_PASSE2) {
        const opcoes = listarNcm8DaPosicao(catalog, "8467");
        return JSON.stringify({
          itens: [
            {
              i: 0,
              ncm: opcoes[0]?.ncm ?? "84672999",
              confianca: 0.85,
              justificativaRGI: "RGI 1 — ferramenta elétrica",
              descPt: "Parafusadeira sem fio 18V",
              descDuimp: "Parafusadeira sem fio 18V",
            },
          ],
        });
      }
      throw new Error(`system inesperado: ${system}`);
    };

    const [r] = await executar2PassesComLlm(
      catalog,
      [{ descOriginal: "DE-WZ-1001 — Akku-Bohrschrauber 18V mit 2 Akkus und Koffer" }],
      chamarLlm,
    );

    expect(r!.avisoTraducao).toBe(AVISO_TRADUCAO_INDISPONIVEL);
    expect(r!.ncmCandidatos.length).toBeGreaterThan(0);
    expect(r!.ncmCandidatos[0]!.ncm.startsWith("8467")).toBe(true);
  });
});
