import type { Item } from "./types.ts";
import {
  confirmacaoNcmVigente,
  itensBloqueandoPdf,
  itensPendentesConfirmacaoNcm,
  LIMIAR_CONFIANCA_NCM,
  mesclarItensInvalidosPdfAudit,
  mesclarOrdemItensPersistidos,
  metaConfirmacaoNcm,
  validarConfirmacaoNcmItem,
  limparConfirmacaoNcm,
  idxPorOrdem,
  ordemDoItem,
} from "@cia/shared";
import { ncm8Limpo } from "@cia/shared";

/**
 * Regra estrutural — DUPLICADA no front de propósito.
 * NCM de 8 dígitos informado ⇒ aceito no fechamento (não depende da versão do bundle shared).
 */
export function ncmInformadoParaFechamento(it: Item): boolean {
  const key = ncm8Limpo(it.ncm ?? "");
  return Boolean(key && key !== "00000000");
}

/** PDF bloqueado somente se algum item não tem NCM informado. */
export function pdfBloqueadoPorNcm(itens: Item[]): boolean {
  return itens.some((it) => !ncmInformadoParaFechamento(it));
}

export function itemBloqueiaPdfNcm(it: Item): boolean {
  return !ncmInformadoParaFechamento(it);
}

export function itemPrecisaResolucaoNcm(it: Item): boolean {
  return !ncmInformadoParaFechamento(it);
}

export function itemPodeConfirmarNcm(it: Item): boolean {
  return itemPrecisaResolucaoNcm(it);
}

export function itemPodeConfirmarNcmIndividual(it: Item): boolean {
  return itemPrecisaResolucaoNcm(it);
}

export {
  metaConfirmacaoNcm,
  validarConfirmacaoNcmItem,
  confirmacaoNcmVigente,
  limparConfirmacaoNcm,
  itensBloqueandoPdf,
  itensPendentesConfirmacaoNcm,
  mesclarItensInvalidosPdfAudit,
  LIMIAR_CONFIANCA_NCM,
  idxPorOrdem,
  ordemDoItem,
  mesclarOrdemItensPersistidos,
};

/** @deprecated use itemBloqueiaPdfNcm */
export function itensComNcmInvalido(itens: Item[]): Item[] {
  return itens.filter((it) => !ncmInformadoParaFechamento(it));
}

export function itensComIncompatibilidadeProduto(itens: Item[]): Item[] {
  return itens.filter((it) => it.compatibilidadeProduto === "incompativel");
}

export function itensEmRevisaoNcm(itens: Item[]): Item[] {
  return itens.filter((it) => !ncmInformadoParaFechamento(it));
}

export function itemPodeDesfazerNcm(it: Item): boolean {
  return confirmacaoNcmVigente(it);
}

export type SeveridadeNcmResolucao = "bloqueia" | "revisar" | "ok";

export interface PendenciaNcmItem {
  idx: number;
  ordem: number;
  item: Item;
  nome: string;
  motivo: string;
  motivoCurto: string;
  severidade: "bloqueia" | "revisar";
}

export function nomeProdutoItem(it: Item, maxLen = 48): string {
  return (it.descPt || it.descOriginal || "Item").trim().slice(0, maxLen);
}

export function severidadeNcmItem(it: Item): SeveridadeNcmResolucao {
  if (ncmInformadoParaFechamento(it)) return "ok";
  return "bloqueia";
}

export function motivoResolucaoNcm(_it: Item): string {
  return "NCM pendente — informe o código de 8 dígitos";
}

export function motivoCurtoNcm(_it: Item): string {
  return "NCM pendente";
}

/** Só itens SEM NCM entram na barra — whisky/chá com NCM nunca aparecem aqui. */
export function pendenciasNcmOrdenadas(itens: Item[]): PendenciaNcmItem[] {
  return itens
    .map((item, idx) => ({ idx, ordem: item.ordem ?? idx + 1, item }))
    .filter(({ item }) => !ncmInformadoParaFechamento(item))
    .map(({ idx, ordem, item }) => ({
      idx,
      ordem,
      item,
      nome: nomeProdutoItem(item),
      motivo: motivoResolucaoNcm(item),
      motivoCurto: motivoCurtoNcm(item),
      severidade: "bloqueia" as const,
    }));
}

export function contagemEstadosNcm(itens: Item[]): {
  bloqueando: number;
  revisar: number;
  ok: number;
} {
  const pendencias = pendenciasNcmOrdenadas(itens);
  return {
    bloqueando: pendencias.length,
    revisar: 0,
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

export function mensagemBloqueioPdf(itens: Item[]): string {
  const bloqueadores = pendenciasNcmOrdenadas(itens);
  if (!bloqueadores.length) return "";
  const linhas = bloqueadores.map(linhaPendenciaCurta).join("; ");
  return `PDF bloqueado: ${linhas}. Informe o NCM de 8 dígitos na aba Detalhamento técnico.`;
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
  if (restantes > 0) titulo += ` +${restantes} → ver todos`;
  titulo += ". Informe o NCM na aba abaixo.";
  return { titulo, visiveis, restantes };
}

export function resumoBloqueioNcm(itens: Item[]): string {
  return mensagemBloqueioPdf(itens);
}

/** Informativo — não bloqueia PDF. */
export function avisoCompatibilidadePdf(itens: Item[]): string | null {
  const qtd = itensComIncompatibilidadeProduto(itens).length;
  if (!qtd) return null;
  return `${qtd} item(ns) com possível incompatibilidade NCM × produto (informativo — não bloqueia o PDF).`;
}

export function itensResolucaoNcm(itens: Item[]): Array<{ idx: number; ordem: number; item: Item }> {
  return pendenciasNcmOrdenadas(itens).map(({ idx, ordem, item }) => ({ idx, ordem, item }));
}
