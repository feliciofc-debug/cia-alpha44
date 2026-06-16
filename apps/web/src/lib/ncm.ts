import type { Item } from "./types.ts";
import {
  confirmacaoNcmVigente,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  itensBloqueandoPdf,
  itensPendentesConfirmacaoNcm,
  itensResolucaoNcm,
  LIMIAR_CONFIANCA_NCM,
  ncm8Limpo,
} from "@cia/shared";

/** @deprecated use itemBloqueiaPdfNcm / itensBloqueandoPdf */
export function itensComNcmInvalido(itens: Item[]): Item[] {
  return itensBloqueandoPdf(itens);
}

export function itensComIncompatibilidadeProduto(itens: Item[]): Item[] {
  return itens.filter((it) => it.compatibilidadeProduto === "incompativel");
}

export function itensEmRevisaoNcm(itens: Item[]): Item[] {
  return itensPendentesConfirmacaoNcm(itens);
}

export function itemPodeDesfazerNcm(it: Item): boolean {
  return confirmacaoNcmVigente(it);
}

export {
  metaConfirmacaoNcm,
  validarConfirmacaoNcmItem,
  confirmacaoNcmVigente,
  limparConfirmacaoNcm,
  itemPodeConfirmarNcm,
  itemPodeConfirmarNcmIndividual,
  itemBloqueiaPdfNcm,
  itensBloqueandoPdf,
  itensPendentesConfirmacaoNcm,
  itensResolucaoNcm,
  itemPrecisaResolucaoNcm,
  LIMIAR_CONFIANCA_NCM,
  idxPorOrdem,
  ordemDoItem,
  mesclarOrdemItensPersistidos,
} from "@cia/shared";

export type SeveridadeNcmResolucao = "bloqueia" | "revisar" | "ok";

export interface PendenciaNcmItem {
  /** Índice no array (UI, scroll, draft). */
  idx: number;
  /** Chave persistida — usar em rotas /itens/:ordem/*. */
  ordem: number;
  item: Item;
  nome: string;
  motivo: string;
  motivoCurto: string;
  severidade: "bloqueia" | "revisar";
}

export function pdfBloqueadoPorNcm(itens: Item[]): boolean {
  return itens.some(itemBloqueiaPdfNcm);
}

export function nomeProdutoItem(it: Item, maxLen = 48): string {
  return (it.descPt || it.descOriginal || "Item").trim().slice(0, maxLen);
}

/** Severidade visual na barra de resolução (semáforo). */
export function severidadeNcmItem(it: Item): SeveridadeNcmResolucao {
  if (!itemPrecisaResolucaoNcm(it)) return "ok";
  if (itemNcmBloqueiaSevero(it)) return "bloqueia";
  return "revisar";
}

function itemNcmBloqueiaSevero(it: Item): boolean {
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000") return true;
  if (it.ncmValido === false) return true;
  if (it.ncmFonte === "pendente") return true;
  if (it.compatibilidadeProduto === "incompativel") return true;
  return false;
}

function motivoCompatibilidadeLegivel(it: Item): string | null {
  const bruto = it.motivoCompatibilidade?.trim();
  if (!bruto || bruto.length > 96) return null;
  const lower = bruto.toLowerCase();
  if (
    lower.includes("familia") ||
    lower.includes("guard-rail") ||
    lower.includes("cache") ||
    lower.includes("pipeline")
  ) {
    return null;
  }
  return bruto;
}

/** Motivo completo na lista de resolução — português simples. */
export function motivoResolucaoNcm(it: Item): string {
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000") {
    return "Classificação pendente — sem candidato válido";
  }
  if (it.ncmValido === false) {
    return "NCM inválido — corrija ou confirme manualmente";
  }
  if (it.ncmFonte === "pendente") {
    return "Classificação pendente — sem candidato";
  }
  if (it.compatibilidadeProduto === "incompativel") {
    return motivoCompatibilidadeLegivel(it) ?? "NCM incompatível com o produto";
  }
  if (it.compatibilidadeProduto === "revisar") {
    const legivel = motivoCompatibilidadeLegivel(it);
    if (legivel) return legivel.endsWith(".") ? legivel : `${legivel} — confirme`;
    return "Revisar compatibilidade — confirme o NCM";
  }
  const aviso = it.ncmAvisos?.find((a) => a.trim().length > 0 && a.length <= 96);
  if (aviso) return aviso;
  if (it.ncmConfianca != null && it.ncmConfianca < LIMIAR_CONFIANCA_NCM) {
    return `Baixa confiança (${Math.round(it.ncmConfianca * 100)}%) — confirme`;
  }
  return "Confirme o NCM antes de gerar o PDF";
}

/** Rótulo curto para toast e banner (produto-primeiro). */
export function motivoCurtoNcm(it: Item): string {
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000" || it.ncmFonte === "pendente") return "NCM pendente";
  if (it.compatibilidadeProduto === "incompativel") return "incompatível";
  if (it.compatibilidadeProduto === "revisar") return "revisar";
  if (it.ncmValido === false) return "NCM inválido";
  if (it.ncmConfianca != null && it.ncmConfianca < LIMIAR_CONFIANCA_NCM) return "confirme";
  return "revisar";
}

export function pendenciasNcmOrdenadas(itens: Item[]): PendenciaNcmItem[] {
  const fila = itensResolucaoNcm(itens).map(({ idx, ordem, item }) => {
    const severidade = severidadeNcmItem(item);
    return {
      idx,
      ordem,
      item,
      nome: nomeProdutoItem(item),
      motivo: motivoResolucaoNcm(item),
      motivoCurto: motivoCurtoNcm(item),
      severidade: severidade === "bloqueia" ? "bloqueia" : "revisar",
    } satisfies PendenciaNcmItem;
  });

  fila.sort((a, b) => {
    if (a.severidade === "bloqueia" && b.severidade !== "bloqueia") return -1;
    if (a.severidade !== "bloqueia" && b.severidade === "bloqueia") return 1;
    return a.idx - b.idx;
  });

  return fila;
}

export function contagemEstadosNcm(itens: Item[]): {
  bloqueando: number;
  revisar: number;
  ok: number;
} {
  const pendencias = pendenciasNcmOrdenadas(itens);
  return {
    bloqueando: pendencias.filter((p) => p.severidade === "bloqueia").length,
    revisar: pendencias.filter((p) => p.severidade === "revisar").length,
    ok: Math.max(0, itens.length - pendencias.length),
  };
}

export function resumoContagemNcm(itens: Item[]): string {
  const { bloqueando, revisar, ok } = contagemEstadosNcm(itens);
  return `${bloqueando} bloqueando · ${revisar} revisar · ${ok} OK`;
}

function linhaPendenciaCurta(p: Pick<PendenciaNcmItem, "nome" | "motivoCurto">): string {
  return `${p.nome} (${p.motivoCurto})`;
}

/** Banner / tooltip — produto-primeiro, lista todos os bloqueadores de PDF. */
export function mensagemBloqueioPdf(itens: Item[]): string {
  const bloqueadores = pendenciasNcmOrdenadas(itens).filter(({ item }) => itemBloqueiaPdfNcm(item));
  if (!bloqueadores.length) return "";
  const linhas = bloqueadores.map(linhaPendenciaCurta).join("; ");
  return `PDF bloqueado: ${linhas}. Resolva na aba Detalhamento técnico.`;
}

export function mensagemToastBloqueioPdf(itens: Item[]): {
  titulo: string;
  visiveis: PendenciaNcmItem[];
  restantes: number;
} {
  return mensagemToastDePendencias(pendenciasNcmOrdenadas(itens));
}

export function mensagemToastDePendencias(pendencias: PendenciaNcmItem[]): {
  titulo: string;
  visiveis: PendenciaNcmItem[];
  restantes: number;
} {
  if (!pendencias.length) {
    return { titulo: "", visiveis: [], restantes: 0 };
  }

  const visiveis = pendencias.slice(0, 2);
  const restantes = pendencias.length - visiveis.length;
  let titulo = `PDF bloqueado: ${visiveis.map(linhaPendenciaCurta).join("; ")}`;
  if (restantes > 0) {
    titulo += ` +${restantes} → ver todos`;
  }
  titulo += ". Resolva na aba abaixo.";

  return { titulo, visiveis, restantes };
}

/** @deprecated prefer mensagemBloqueioPdf */
export function resumoBloqueioNcm(itens: Item[]): string {
  return mensagemBloqueioPdf(itens);
}

/** Aviso não bloqueante — possível incompatibilidade semântica produto × NCM. */
export function avisoCompatibilidadePdf(itens: Item[]): string | null {
  const qtd = itensComIncompatibilidadeProduto(itens).length;
  if (!qtd) return null;
  return `${qtd} item(ns) com possível incompatibilidade NCM × produto — revisar antes de enviar`;
}
