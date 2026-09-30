import type { LineInput, Line, TaxMode, Snapshot } from "./types";
export const money = (n: number | string = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n));
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function dateLabel(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(
        new Date(value.length === 10 ? value + "T00:00:00+05:30" : value),
      )
    : "—";
}
// Integer paise / basis points mirror PostgreSQL decimal rounding, including split GST.
export function priceLines(input: LineInput[], mode: TaxMode) {
  const items: Line[] = input.map((i) => {
    const paise = Math.round(i.unit_price * 100);
    const discount = Math.round(i.discount_pct * 100);
    const rate = mode === "None" ? 0 : Math.round(i.tax_rate * 100);
    const net = Math.round((i.quantity * paise * (10000 - discount)) / 10000);
    const tax =
      mode === "CGST/SGST"
        ? 2 * Math.round((net * rate) / 20000)
        : Math.round((net * rate) / 10000);
    return {
      ...i,
      tax_rate: rate / 100,
      subtotal: net / 100,
      tax_amount: tax / 100,
      total: (net + tax) / 100,
    };
  });
  const subtotal =
    items.reduce((n, i) => n + Math.round(i.subtotal * 100), 0) / 100;
  const tax_amount =
    items.reduce((n, i) => n + Math.round(i.tax_amount * 100), 0) / 100;
  return {
    items,
    subtotal,
    tax_amount,
    total: Math.round((subtotal + tax_amount) * 100) / 100,
  };
}
export function orderMoney(s: Snapshot, id: string) {
  const o = s.orders.find((o) => o.id === id);
  const d = s.documents.find((d) => d.id === o?.quote_id);
  const total = Number(d?.total ?? 0);
  const paid = s.payments
    .filter((p) => p.order_id === id)
    .reduce((n, p) => n + Number(p.amount) * (p.kind === "Refund" ? -1 : 1), 0);
  return { total, paid, balance: Math.round((total - paid) * 100) / 100 };
}
export const blankLine = (): LineInput => ({
  description: "",
  quantity: 1,
  unit_price: 0,
  discount_pct: 0,
  tax_rate: 0,
  hsn: "",
  details: "",
  category: "Other",
});
