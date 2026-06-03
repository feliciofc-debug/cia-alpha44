/**
 * Câmbio via PTAX (Banco Central — API Olinda, pública, sem autenticação).
 * Busca a última cotação de venda disponível (tenta os últimos dias úteis).
 * Em caso de falha de rede, retorna fallback marcado para preenchimento manual.
 */

export interface CambioResult {
  moeda: string;
  cotacaoCompra: number | null;
  cotacaoVenda: number | null;
  dataCotacao: string | null;
  fonte: "PTAX" | "indisponível";
}

function mmddyyyy(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}

export async function buscarCambioPtax(moeda = "USD"): Promise<CambioResult> {
  const base =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia";
  // tenta hoje e volta até 7 dias (fins de semana/feriados não têm boletim)
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const url =
      `${base}(moeda=@m,dataCotacao=@d)?@m='${moeda}'&@d='${mmddyyyy(d)}'` +
      `&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { value?: Array<{ cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string }> };
      const row = data.value?.[data.value.length - 1];
      if (row) {
        return {
          moeda,
          cotacaoCompra: row.cotacaoCompra,
          cotacaoVenda: row.cotacaoVenda,
          dataCotacao: row.dataHoraCotacao,
          fonte: "PTAX",
        };
      }
    } catch {
      // tenta próximo dia
    }
  }
  return { moeda, cotacaoCompra: null, cotacaoVenda: null, dataCotacao: null, fonte: "indisponível" };
}
