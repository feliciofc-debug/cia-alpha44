import { describe, expect, it } from "vitest";
import { parsePlanilhaRows } from "../src/parser.js";

const HEADERS_NCM = [
  "HS编码",
  "商品编码",
  "税则号",
  "海关编码",
  "税号",
  "N.C.M",
  "Código Fiscal",
  "HS Code",
];

const VARIACOES_NCM = ["N C M", "N-C-M", "H.S. Code", "H S Code"];

describe("Parser — cabeçalhos de NCM da planilha-cliente", () => {
  it.each(HEADERS_NCM)("detecta %s como coluna NCM mesmo com descrição já mapeada", (headerNcm) => {
    const parsed = parsePlanilhaRows([
      ["Description", "Qty", "FOB Total USD", headerNcm],
      ["Widget teste", 10, 100, "8423.89.00"],
    ]);

    const colunaNcm = parsed.colunas.find((c) => c.tipo === "ncm");
    expect(colunaNcm?.header).toBe(headerNcm);
    expect(parsed.colunaNcmDetectada).toBe(true);
    expect(parsed.linhasComNcmColuna).toBe(1);
    expect(parsed.linhas).toHaveLength(1);
    expect(parsed.linhas[0]?.ncm).toBe("84238900");
  });

  it.each(VARIACOES_NCM)("detecta variação com pontuação/espaço: %s", (headerNcm) => {
    const parsed = parsePlanilhaRows([
      ["Description", "Qty", "FOB Total USD", headerNcm],
      ["Widget teste", 10, 100, "8423.89.00"],
    ]);

    expect(parsed.colunas.find((c) => c.tipo === "ncm")?.header).toBe(headerNcm);
    expect(parsed.linhas[0]?.ncm).toBe("84238900");
  });
});
