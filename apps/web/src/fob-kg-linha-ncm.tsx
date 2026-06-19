import type { Item } from "./lib/types.ts";
import { fobKgPlanilhaNcmInfo, fmtFobKgPlanilha, usdKg } from "./lib/fob-kg.ts";

/** FOB/kg da planilha operacional — exibido junto ao NCM na tabela de itens. */
export function FobKgLinhaNcm({ item }: { item: Item }) {
  const info = fobKgPlanilhaNcmInfo(item);
  if (!info) return null;

  if (info.naPlanilhaChina) {
    return (
      <span
        className="mt-1 block text-[11px] font-semibold leading-tight text-emerald-300"
        title={`${info.fonte} — mesmo valor da coluna PREÇO FOB/KG`}
      >
        FOB/kg: ${fmtFobKgPlanilha(info.valor)}/kg
        <span className="mt-0.5 block text-[10px] font-normal text-emerald-400/80">{info.fonte}</span>
      </span>
    );
  }

  return (
    <span
      className="mt-1 block text-[10px] leading-tight text-amber-400/90"
      title="NCM não encontrado na planilha China — referência ComexStat"
    >
      FOB/kg ref.: {usdKg(info.valor)}
      <span className="block text-[10px] text-amber-500/80">{info.fonte}</span>
    </span>
  );
}
