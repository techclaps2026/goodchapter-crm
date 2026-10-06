import type { Expense, ExpenseCategory, Snapshot } from "./types";
import { EXPENSE_CATEGORIES } from "./types";
import { istDate } from "./domain";

// Sum in integer paise so totals match PostgreSQL numeric(14,2).
const paise = (value: number | string | null | undefined) =>
  Math.round(Number(value ?? 0) * 100);
const sum = (values: number[]) => values.reduce((n, v) => n + v, 0);
const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 10000) / 100 : null;

/** Revenue is the pre-tax subtotal: GST is collected for the government, not earned. */
export function orderProfit(s: Snapshot, orderId: string) {
  const order = s.orders.find((o) => o.id === orderId);
  const quote = s.documents.find((d) => d.id === order?.quote_id);
  const priced =
    s.documents.find(
      (d) =>
        d.kind === "invoice" &&
        d.order_id === orderId &&
        d.status !== "Superseded",
    ) ?? quote;
  const costs = s.order_costs.filter((c) => c.order_id === orderId);
  const revenue = paise(priced?.subtotal);
  const itemCost = sum(costs.map((c) => paise(c.amount)));
  const expenses = sum(
    s.expenses.filter((e) => e.order_id === orderId).map((e) => paise(e.amount)),
  );
  const grossProfit = revenue - itemCost - expenses;
  // Vendor costs are entered against the accepted quotation's lines.
  const itemCount = quote?.items.length ?? 0;
  return {
    revenue: revenue / 100,
    itemCost: itemCost / 100,
    expenses: expenses / 100,
    totalCost: (itemCost + expenses) / 100,
    grossProfit: grossProfit / 100,
    margin: percent(grossProfit, revenue),
    costedItems: costs.length,
    itemCount,
    costsComplete: itemCount > 0 && costs.length >= itemCount,
  };
}

export const NO_LINK = "none";
export type ExpenseView = "all" | "procurement" | "order";
export interface ExpenseFilters {
  search: string;
  from: string;
  to: string;
  category: string;
  vendorId: string;
  orderId: string;
  clientId: string;
  method: string;
}
export const blankExpenseFilters = (): ExpenseFilters => ({
  search: "",
  from: "",
  to: "",
  category: "",
  vendorId: "",
  orderId: "",
  clientId: "",
  method: "",
});

/** Newest first. `NO_LINK` selects expenses without a vendor or order. */
export function filterExpenses(
  s: Snapshot,
  f: ExpenseFilters,
  view: ExpenseView = "all",
) {
  const q = f.search.trim().toLowerCase();
  const orders = new Map(s.orders.map((o) => [o.id, o]));
  const vendors = new Map(s.vendors.map((v) => [v.id, v]));
  return s.expenses
    .filter((e) => {
      const order = e.order_id ? orders.get(e.order_id) : undefined;
      if (view === "procurement" && e.category !== "Procurement") return false;
      if (view === "order" && !e.order_id) return false;
      if (f.from && e.expense_date < f.from) return false;
      if (f.to && e.expense_date > f.to) return false;
      if (f.category && e.category !== f.category) return false;
      if (f.method && e.payment_method !== f.method) return false;
      if (f.vendorId === NO_LINK ? e.vendor_id : f.vendorId && e.vendor_id !== f.vendorId)
        return false;
      if (f.orderId === NO_LINK ? e.order_id : f.orderId && e.order_id !== f.orderId)
        return false;
      if (f.clientId && order?.client_id !== f.clientId) return false;
      if (!q) return true;
      return [
        e.description,
        e.payee,
        e.category,
        e.payment_method,
        e.vendor_id ? vendors.get(e.vendor_id)?.name : "",
        order?.ref,
        order?.title,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort(
      (a, b) =>
        b.expense_date.localeCompare(a.expense_date) ||
        b.created_at.localeCompare(a.created_at),
    );
}

export const expenseTotal = (expenses: Expense[]) =>
  sum(expenses.map((e) => paise(e.amount))) / 100;

export function totalsByCategory(expenses: Expense[]) {
  const total = sum(expenses.map((e) => paise(e.amount)));
  return EXPENSE_CATEGORIES.map((category) => {
    const rows = expenses.filter((e) => e.category === category);
    const amount = sum(rows.map((e) => paise(e.amount)));
    return {
      category,
      count: rows.length,
      total: amount / 100,
      share: percent(amount, total),
    };
  }).filter((row) => row.count > 0);
}

/**
 * Expenses plus order item costs for each vendor. Item costs follow the
 * vendor assigned to the line and are dated by the order's creation date.
 */
export function vendorSpend(
  s: Snapshot,
  expenses: Expense[],
  f: Pick<ExpenseFilters, "from" | "to" | "orderId" | "clientId" | "vendorId">,
) {
  const rows = new Map<
    string,
    { vendorId: string; expenseCount: number; expenses: number; itemCost: number }
  >();
  const row = (vendorId: string) => {
    if (!rows.has(vendorId))
      rows.set(vendorId, { vendorId, expenseCount: 0, expenses: 0, itemCost: 0 });
    return rows.get(vendorId)!;
  };
  for (const e of expenses) {
    const r = row(e.vendor_id ?? NO_LINK);
    r.expenseCount++;
    r.expenses += paise(e.amount);
  }
  const orders = new Map(s.orders.map((o) => [o.id, o]));
  for (const cost of s.order_costs) {
    const vendorId = s.order_vendors.find(
      (v) => v.order_id === cost.order_id && v.item_index === cost.item_index,
    )?.vendor_id;
    const order = orders.get(cost.order_id);
    if (!vendorId || !order) continue;
    const orderDate = istDate(order.created_at);
    if (
      (f.vendorId && f.vendorId !== vendorId) ||
      (f.orderId && f.orderId !== order.id) ||
      (f.clientId && f.clientId !== order.client_id) ||
      (f.from && orderDate < f.from) ||
      (f.to && orderDate > f.to)
    )
      continue;
    row(vendorId).itemCost += paise(cost.amount);
  }
  return [...rows.values()]
    .map((r) => ({
      vendorId: r.vendorId,
      name:
        r.vendorId === NO_LINK
          ? "No vendor linked"
          : (s.vendors.find((v) => v.id === r.vendorId)?.name ?? "Deleted vendor"),
      expenseCount: r.expenseCount,
      expenses: r.expenses / 100,
      itemCost: r.itemCost / 100,
      total: (r.expenses + r.itemCost) / 100,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export type PnlGroup = "cogs" | "logistics" | "operational" | "other";
export const PNL_GROUPS: Record<ExpenseCategory, PnlGroup> = {
  Procurement: "cogs",
  Logistics: "logistics",
  Transportation: "logistics",
  Samples: "operational",
  Packaging: "operational",
  Printing: "operational",
  Miscellaneous: "other",
};
export const PNL_LABELS: Record<PnlGroup, string> = {
  cogs: "Cost of goods / procurement",
  logistics: "Logistics",
  operational: "Operational expenses",
  other: "Other expenses",
};

/**
 * Revenue is the pre-tax subtotal of current issued invoices dated in the
 * period, excluding cancelled orders. Those orders' item costs count as cost
 * of goods; expenses count by their own date.
 */
export function profitAndLoss(s: Snapshot, from: string, to: string) {
  const inRange = (d: string | null | undefined) =>
    !!d && (!from || d >= from) && (!to || d <= to);
  const cancelled = new Set(
    s.orders.filter((o) => o.status === "Cancelled").map((o) => o.id),
  );
  const invoices = s.documents.filter(
    (d) =>
      d.kind === "invoice" &&
      d.status === "Issued" &&
      inRange(d.issued_on) &&
      !cancelled.has(d.order_id!),
  );
  const invoiced = new Set(invoices.map((d) => d.order_id));
  const revenue = sum(invoices.map((d) => paise(d.subtotal)));
  const itemCost = sum(
    s.order_costs.filter((c) => invoiced.has(c.order_id)).map((c) => paise(c.amount)),
  );
  const groups: Record<PnlGroup, number> = {
    cogs: 0,
    logistics: 0,
    operational: 0,
    other: 0,
  };
  for (const e of s.expenses)
    if (inRange(e.expense_date)) groups[PNL_GROUPS[e.category]] += paise(e.amount);
  const costs = itemCost + sum(Object.values(groups));
  return {
    revenue: revenue / 100,
    itemCost: itemCost / 100,
    lines: (Object.keys(PNL_LABELS) as PnlGroup[]).map((group) => ({
      group,
      label: PNL_LABELS[group],
      amount: (groups[group] + (group === "cogs" ? itemCost : 0)) / 100,
    })),
    totalCosts: costs / 100,
    profit: (revenue - costs) / 100,
    margin: percent(revenue - costs, revenue),
  };
}

export type PeriodKind =
  | "month"
  | "last_month"
  | "quarter"
  | "fy"
  | "last_fy"
  | "all";
export const PERIOD_LABELS: Record<PeriodKind, string> = {
  month: "This month",
  last_month: "Last month",
  quarter: "This quarter",
  fy: "This financial year",
  last_fy: "Last financial year",
  all: "All time",
};
const pad = (n: number) => String(n).padStart(2, "0");
const monthEnd = (y: number, m: number) =>
  `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
const fyLabel = (start: number) => `FY ${start}–${String(start + 1).slice(2)}`;

/** Periods follow the Indian financial year, April to March. */
export function periodRange(
  kind: PeriodKind,
  today: string,
): { from: string; to: string; label?: string } {
  const [y, m] = today.split("-").map(Number);
  const fyStart = m >= 4 ? y : y - 1;
  switch (kind) {
    case "month":
      return { ...monthRange(`${y}-${pad(m)}`), label: monthLabel(`${y}-${pad(m)}`) };
    case "last_month": {
      const month = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
      return { ...monthRange(month), label: monthLabel(month) };
    }
    case "quarter": {
      const start = Math.floor((m - 1) / 3) * 3 + 1;
      return {
        from: `${y}-${pad(start)}-01`,
        to: monthEnd(y, start + 2),
        label: `Q${(Math.floor((m - 4 + 12) / 3) % 4) + 1} ${fyLabel(fyStart)}`,
      };
    }
    case "fy":
      return { from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31`, label: fyLabel(fyStart) };
    case "last_fy":
      return {
        from: `${fyStart - 1}-04-01`,
        to: `${fyStart}-03-31`,
        label: fyLabel(fyStart - 1),
      };
    default:
      return { from: "", to: "", label: "All time" };
  }
}

/** Calendar months (YYYY-MM) from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${pad(m)}`);
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return months;
}
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: monthEnd(y, m) };
}
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
