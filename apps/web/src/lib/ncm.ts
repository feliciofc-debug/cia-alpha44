import type { Item } from "./types.ts";
import { confirmacaoNcmVigente, LIMIAR_CONFIANCA_NCM, ncm8Limpo } from "@cia/shared";

/**
 * Regra estrutural — DUPLICADA no front de propósito.
 * NCM de 8 dígitos informado ⇒ aceito no fechamento (não depende da versão do bundle shared).
 */
export function ncmInformadoParaFechamento(it: Item): boolean {
  const key = ncm8Limpo(it.ncm ?? "");
  return Boolean(key && key !== "00000000");
}

/** NCM pendente é informativo: não bloqueia o PDF. */
export function pdfBloqueadoPorNcm(itens: Item[]): boolean {
  void itens;
  return false;
}

export function itemBloqueiaPdfNcm(it: Item): boolean {
  void it;
  return false;
}

export function itemPrecisaResolucaoNcm(it: Item): boolean {
  return !ncmInformadoParaFechamento(it);
}

export function itemPodeConfirmarNcm(it: Item): boolean {
  return itemPodeConfirmarNcmIndividual(it);
}

export function itemPodeConfirmarNcmIndividual(it: Item): boolean {
  if (!ncmInformadoParaFechamento(it)) return false;
  if (confirmacaoNcmVigente(it)) return false;
  if (it.ncmFonte === "gemini" || it.ncmFonte === "ia") return true;
  if (it.ncmEmbarqueStatus === "sem-ncm-coluna") return true;
  if (it.compatibilidadeProduto === "revisar" || it.compatibilidadeProduto === "incompativel") {
    return true;
  }
  if (it.ncmConfianca != null && it.ncmConfianca < LIMIAR_CONFIANCA_NCM) return true;
  return false;
}

export function itensPendentesConfirmacaoNcm(itens: Item[]): Item[] {
  return itens.filter((it) => itemPodeConfirmarNcmIndividual(it));
}

export {
  metaConfirmacaoNcm,
  validarConfirmacaoNcmItem,
  confirmacaoNcmVigente,
  limparConfirmacaoNcm,
  itensBloqueandoPdf,
  mesclarItensInvalidosPdfAudit,
  LIMIAR_CONFIANCA_NCM,
  idxPorOrdem,
  ordemDoItem,
  mesclarOrdemItensPersistidos,
} from "@cia/shared";

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
  return "revisar";
}

export function motivoResolucaoNcm(_it: Item): string {
  return "NCM pendente — informe o código de 8 dígitos se quiser; o PDF não bloqueia";
}

export function motivoCurtoNcm(_it: Item): string {
  return "NCM pendente (informativo)";
}

/** Só itens SEM NCM entram na barra — informativo, sem bloquear PDF. */
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
      severidade: "revisar" as const,
    }));
}

export function contagemEstadosNcm(itens: Item[]): {
  bloqueando: number;
  revisar: number;
  ok: number;
} {
  const pendencias = pendenciasNcmOrdenadas(itens);
  return {
    bloqueando: 0,
    revisar: pendencias.length,
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
  return `NCM pendente: ${linhas}. Informe se quiser; o PDF não bloqueia.`;
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
  let titulo = `NCM pendente: ${visiveis.map(linhaPendenciaCurta).join("; ")}`;
  if (restantes > 0) titulo += ` +${restantes} → ver todos`;
  titulo += ". Informe se quiser; o PDF não bloqueia.";
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
