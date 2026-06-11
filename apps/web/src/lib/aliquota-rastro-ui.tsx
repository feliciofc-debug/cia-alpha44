import {
  fonteExibicaoTributo,
  type ChaveTributoRastro,
  type RastroTributo,
} from "@cia/shared";
import type { Item } from "./types.ts";
import { pct } from "./format.ts";

export type { ChaveTributoRastro, RastroAliquotas, RastroTributo } from "@cia/shared";

export function rastroTributoItem(
  it: Item,
  campo: ChaveTributoRastro,
): RastroTributo | undefined {
  return it.aliquotasRastro?.[campo];
}

export function itemTemOverrideTributo(it: Item, campo: ChaveTributoRastro): boolean {
  return it.aliquotasRastro?.[campo]?.origem === "manual";
}

function fmtDataRastro(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export function tooltipRastroAliquota(rastro: RastroTributo | undefined, legado: boolean): string {
  if (!rastro && legado) return "Fonte: legado (cotação salva antes do rastro T7)";
  if (!rastro) return "";
  const fonte = fonteExibicaoTributo(rastro, { legado });
  const parts = [`Fonte: ${fonte}`, `Origem: ${rastro.origem}`, `Consultado em: ${fmtDataRastro(rastro.consultadoEm)}`];
  if (rastro.origem === "manual") {
    if (rastro.editadoPor) parts.push(`Editado por: ${rastro.editadoPor}`);
    if (rastro.editadoEm) parts.push(`Editado em: ${fmtDataRastro(rastro.editadoEm)}`);
    if (rastro.valorOriginal != null) parts.push(`Valor original: ${pct(rastro.valorOriginal)}`);
    if (rastro.fonteOriginal) parts.push(`Fonte original: ${rastro.fonteOriginal}`);
  }
  return parts.join("\n");
}

export function DetalheRastroAliquota({
  it,
  campo,
  onDesfazer,
  desfazendo,
}: {
  it: Item;
  campo: ChaveTributoRastro;
  onDesfazer?: () => void;
  desfazendo?: boolean;
}) {
  const legado = !it.aliquotasRastro;
  const rastro = rastroTributoItem(it, campo);
  const fonte = fonteExibicaoTributo(rastro, { legado, aliquotasOverride: it.aliquotasOverride });
  const manual = rastro?.origem === "manual";
  const tooltip = tooltipRastroAliquota(rastro, legado);

  return (
    <div className="mt-1 max-w-[9rem] space-y-0.5">
      <span
        className="block truncate text-[9px] leading-tight text-slate-500"
        title={tooltip || undefined}
      >
        {fonte}
      </span>
      {rastro?.consultadoEm && !manual && (
        <span className="block text-[9px] text-slate-600" title={tooltip || undefined}>
          {fmtDataRastro(rastro.consultadoEm)}
        </span>
      )}
      {manual && (
        <>
          <span className="inline-block rounded bg-brand-500/25 px-1 py-px text-[9px] font-semibold text-brand-200">
            manual
          </span>
          <span className="block text-[9px] leading-tight text-brand-200/90" title={tooltip || undefined}>
            {rastro.editadoPor ? `por ${rastro.editadoPor}` : "editado"}
            {rastro.editadoEm ? ` · ${fmtDataRastro(rastro.editadoEm)}` : ""}
          </span>
          {rastro.valorOriginal != null && (
            <span className="block text-[9px] text-slate-500 line-through">{pct(rastro.valorOriginal)}</span>
          )}
          {onDesfazer && (
            <button
              type="button"
              className="mt-0.5 block rounded bg-slate-600/80 px-1.5 py-px text-[9px] font-semibold text-slate-200 hover:bg-slate-500 disabled:opacity-50"
              disabled={desfazendo}
              onClick={() => onDesfazer()}
            >
              {desfazendo ? "…" : "Desfazer"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
