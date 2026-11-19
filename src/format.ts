const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const currencyCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatCurrency(value: number, cents = false): string {
  return (cents ? currencyCents : currency).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number, digits = 2): string {
  return `${Number(value.toFixed(digits))}%`;
}

export function formatDuration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} yr${y === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} mo`);
  return parts.join(" ") || "0 mo";
}
