import { describe, expect, it } from "vitest";
import { conferirItemNcm } from "../src/siscomex/conferencia.js";

describe("conferência NCM", () => {
  it("confere quando planilha e IA são iguais", () => {
    const r = conferirItemNcm({ ncmPlanilha: "9405.21.00", ncmIa: "94052100" }, null, false);
    expect(r.status).toBe("confere");
    expect(r.ncmPlanilha).toBe("94052100");
    expect(r.ncmIa).toBe("94052100");
  });

  it("diverge quando planilha e IA diferem", () => {
    const r = conferirItemNcm({ ncmPlanilha: "94052100", ncmIa: "85044010" }, null, false);
    expect(r.status).toBe("diverge");
  });

  it("marca so_planilha quando só fornecedor informou NCM", () => {
    const r = conferirItemNcm({ ncmPlanilha: "82042000" }, null, false);
    expect(r.status).toBe("so_planilha");
  });
});
