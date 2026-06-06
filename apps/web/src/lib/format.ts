export const brl = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export const usd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export const usdKg = (n: number | null | undefined, casas = 4) =>
  n == null
    ? "—"
    : `US$ ${n.toLocaleString("en-US", { minimumFractionDigits: casas, maximumFractionDigits: casas })}/kg`;

export const num = (n: number | null | undefined, casas = 2) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const pct = (frac: number | null | undefined, casas = 2) =>
  frac == null ? "—" : `${(frac * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

export const fmtNcm = (ncm: string) => {
  const d = (ncm || "").replace(/\D/g, "").padStart(8, "0");
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
};
