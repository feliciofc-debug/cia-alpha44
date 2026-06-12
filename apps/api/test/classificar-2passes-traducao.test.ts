import { describe, expect, it } from "vitest";
import { criarNcmCatalog, loadNcmVigente } from "@cia/pipeline";
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
  it("timeout na tradução não bloqueia: usa descOriginal + aviso, classifica item PT", async () => {
    const chamarLlm = async (system: string, _user: string) => {
      if (system === SYSTEM_TRANSLATE) throw new Error("timeout");
      if (system === SYSTEM_PASSE1) {
        return JSON.stringify({
          itens: [{ i: 0, posicao4: "9617", confianca: 0.9, justificativaRGI: "RGI 1" }],
        });
      }
      if (system === SYSTEM_PASSE2) {
        return JSON.stringify({
          itens: [
            {
              i: 0,
              ncm: "96170010",
              confianca: 0.88,
              justificativaRGI: "RGI 1 — isotérmico",
              descPt: "Garrafa térmica inox 500ml isolamento vácuo",
              descDuimp: "Garrafa térmica inox 500ml",
            },
          ],
        });
      }
      throw new Error(`system inesperado: ${system}`);
    };

    const [r] = await executar2PassesComLlm(
      catalog,
      [{ descOriginal: "Garrafa térmica inox 500ml isolamento vácuo" }],
      chamarLlm,
    );

    expect(r!.avisoTraducao).toBe(AVISO_TRADUCAO_INDISPONIVEL);
    expect(r!.ncmCandidatos[0]?.ncm).toBe("96170010");
    expect(r!.ncmCandidatos).toHaveLength(1);
    expect(r!.posicaoPasse1).toBe("9617");
  });
});
