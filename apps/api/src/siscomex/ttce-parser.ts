/** Extrai alíquotas II/IPI/PIS/COFINS da resposta TTCE (importação). */

const PIS_PADRAO = 0.021;
const COFINS_PADRAO = 0.0965;

interface TtceAtributo {
  codigo?: string;
  valor?: string;
  descricaoValor?: string;
}

interface TtceTratamento {
  tributo?: { codigo?: string; nome?: string };
  regime?: { codigo?: string; nome?: string };
  fundamentoLegal?: { codigo?: string; nome?: string; tipo?: string };
  mercadorias?: Array<{ atributos?: TtceAtributo[] }>;
}

export interface TtceRespostaImportacao {
  ncm?: string;
  tratamentosTributarios?: TtceTratamento[];
}

function parsePct(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n > 1 ? n / 100 : n;
}

function aliquotaDeAtributos(atributos: TtceAtributo[] | undefined): number | null {
  if (!atributos?.length) return null;
  for (const a of atributos) {
    const cod = (a.codigo ?? "").toUpperCase();
    if (cod.includes("ALIQUOT") || cod === "ATT_2870" || cod === "ATT_15670") {
      const v = parsePct(a.valor);
      if (v != null) return v;
    }
    const desc = a.descricaoValor ?? "";
    const m = desc.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (m) return parsePct(m[1]);
  }
  return null;
}

function nomeTributo(t: TtceTratamento): string {
  return (t.tributo?.nome ?? t.tributo?.codigo ?? "").toUpperCase();
}

function fundamento(t: TtceTratamento): string {
  return (t.fundamentoLegal?.codigo ?? t.fundamentoLegal?.nome ?? "").toUpperCase();
}

/** Preferência: regime 1 (recolhimento integral) + fundamento TEC / IPI normal. */
export function extrairAliquotasTtce(res: TtceRespostaImportacao): {
  ii: number | null;
  ipi: number | null;
  pis: number;
  cofins: number;
  avisos: string[];
} {
  const avisos: string[] = [];
  let ii: number | null = null;
  let ipi: number | null = null;
  let pis = PIS_PADRAO;
  let cofins = COFINS_PADRAO;

  const trats = res.tratamentosTributarios ?? [];

  for (const t of trats) {
    const trib = nomeTributo(t);
    const fund = fundamento(t);
    const regime = t.regime?.codigo ?? "";
    const attrs =
      t.mercadorias?.flatMap((m) => m.atributos ?? []) ??
      [];

    const aliq = aliquotaDeAtributos(attrs);

    if (trib.includes("IMPORTA") && (fund.includes("0003") || fund.includes("TEC"))) {
      if (aliq != null) ii = aliq;
    }
    if (trib === "IPI" || trib.includes("IPI")) {
      if (fund.includes("6999") || fund.includes("TIPI") || regime === "1") {
        if (aliq != null) ipi = aliq;
      }
    }
    if (trib.includes("PIS") && aliq != null) pis = aliq;
    if (trib.includes("COFINS") && aliq != null) cofins = aliq;
  }

  // Tratamentos "normais" sem atributos na resposta — TTCE só lista os que precisam DUIMP;
  // alíquotas padrão TEC podem vir vazias. Caller usa cache como fallback.
  if (ii == null && ipi == null && !trats.length) {
    avisos.push("TTCE sem tratamentos tributários para este NCM/país.");
  }

  return { ii, ipi, pis, cofins, avisos };
}
