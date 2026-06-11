/** Bloqueia PDF quando há NCM inválido, pendente ou incoerente com o produto. */

import type { Item } from "@cia/shared";
import { validarNcmItem, type NcmCatalog } from "@cia/pipeline";
import { confirmacaoNcmVigente } from "@cia/shared";

export interface ItemNcmInvalidoPdf {
  ordem: number;
  descricao: string;
  ncm: string;
  avisos: string[];
}

export class NcmInvalidoPdfError extends Error {
  readonly codigo = "NCM_INVALIDO" as const;
  readonly itens: ItemNcmInvalidoPdf[];

  constructor(itens: ItemNcmInvalidoPdf[]) {
    super(
      `PDF bloqueado: ${itens.length} item(ns) com NCM inválido ou incoerente. Corrija a classificação antes de gerar o orçamento.`,
    );
    this.name = "NcmInvalidoPdfError";
    this.itens = itens;
  }
}

function ncm8(ncm: string): string {
  return ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

/** Audita itens antes de gerar PDF — lança NcmInvalidoPdfError se houver bloqueio. */
export function auditarNcmsParaPdf(itens: Item[], catalog: NcmCatalog): void {
  const invalidos: ItemNcmInvalidoPdf[] = [];

  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]!;
    const desc = (it.descPt || it.descOriginal || "").trim();
    const ncm = (it.ncm ?? "").trim();
    const key = ncm ? ncm8(ncm) : "";

    const avisos = [...(it.ncmAvisos ?? [])];

    if (it.compatibilidadeProduto === "incompativel") {
      invalidos.push({
        ordem: i + 1,
        descricao: desc.slice(0, 100) || `Item ${i + 1}`,
        ncm: ncm || "(pendente)",
        avisos: avisos.length ? avisos : [it.motivoCompatibilidade ?? "NCM × produto incompatível."],
      });
      continue;
    }

    if (!key || key === "00000000") {
      invalidos.push({
        ordem: i + 1,
        descricao: desc.slice(0, 100) || `Item ${i + 1}`,
        ncm: ncm || "(pendente)",
        avisos,
      });
      continue;
    }

    if (confirmacaoNcmVigente(it)) continue;

    let bloqueado = it.ncmValido === false || it.compatibilidadeProduto === "revisar";

    if (key && !catalog.existe(key)) {
      bloqueado = true;
      avisos.push("NCM ausente na tabela vigente Siscomex.");
    }

    if (key && catalog.existe(key) && desc) {
      const v = validarNcmItem(key, desc, catalog, it.ncmFonte ?? "ia");
      if (!v.ok) {
        bloqueado = true;
        for (const a of v.avisos) {
          if (!avisos.includes(a)) avisos.push(a);
        }
      }
    }

    if (bloqueado) {
      invalidos.push({
        ordem: i + 1,
        descricao: desc.slice(0, 100) || `Item ${i + 1}`,
        ncm: ncm || "(pendente)",
        avisos,
      });
    }
  }

  if (invalidos.length) throw new NcmInvalidoPdfError(invalidos);
}
