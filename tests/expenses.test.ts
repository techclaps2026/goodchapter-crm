import { describe, it, expect } from "vitest";
import {
  NO_LINK,
  blankExpenseFilters,
  filterExpenses,
  monthsBetween,
  orderProfit,
  periodRange,
  profitAndLoss,
  totalsByCategory,
  vendorSpend,
} from "../lib/expenses";
import { validateMutation } from "../lib/validation";
import type { Expense, Snapshot } from "../lib/types";

const expense = (over: Partial<Expense>): Expense => ({
  id: crypto.randomUUID(),
  order_id: "o1",
  vendor_id: null,
  category: "Logistics",
  amount: 0,
  expense_date: "2026-10-04",
  payee: "",
  payment_method: "UPI",
  description: "",
  receipt_path: "",
  receipt_name: "",
  created_by: "u1",
  created_at: "2026-10-04T10:00:00Z",
  updated_at: "2026-10-04T10:00:00Z",
  ...over,
});
const line = { description: "Kit", quantity: 1, unit_price: 0 };
// The worked example from THE-6: ₹40,965.75 revenue, ₹30,500 vendor costs.
const snapshot = (): Snapshot =>
  ({
    orders: [
      { id: "o1", ref: "O-2026-0001", title: "Welcome kits", quote_id: "q1", client_id: "c1", status: "Production", created_at: "2026-09-20T05:00:00Z" },
      { id: "o2", ref: "O-2026-0002", title: "Tees", quote_id: "q2", client_id: "c2", status: "Cancelled", created_at: "2026-10-02T05:00:00Z" },
    ],
    documents: [
      { id: "q1", kind: "quote", order_id: null, status: "Accepted", subtotal: 40965.75, items: [line, line] },
      { id: "i1", kind: "invoice", order_id: "o1", status: "Issued", issued_on: "2026-10-03", subtotal: 40965.75, items: [line, line] },
      { id: "q2", kind: "quote", order_id: null, status: "Accepted", subtotal: 9000, items: [line] },
      { id: "i2", kind: "invoice", order_id: "o2", status: "Issued", issued_on: "2026-10-05", subtotal: 9000, items: [line] },
    ],
    order_costs: [
      { order_id: "o1", item_index: 0, amount: "20500.00" },
      { order_id: "o1", item_index: 1, amount: "10000.00" },
      { order_id: "o2", item_index: 0, amount: "4000.00" },
    ],
    order_vendors: [{ order_id: "o1", item_index: 0, vendor_id: "v1" }],
    vendors: [{ id: "v1", name: "Thread & Form" }],
    clients: [],
    expenses: [
      expense({ category: "Logistics", amount: "1200.00" as unknown as number, payee: "BlueDart" }),
      expense({ category: "Samples", amount: 500, expense_date: "2026-10-01" }),
      expense({ category: "Packaging", amount: 300, vendor_id: "v1", receipt_path: "x.pdf" }),
      expense({ order_id: null, category: "Procurement", amount: 2500, vendor_id: "v1", expense_date: "2026-09-15", description: "Blank notebooks" }),
    ],
  }) as unknown as Snapshot;

describe("order profitability", () => {
  it("adds order expenses to vendor costs, matching the issue example", () => {
    const p = orderProfit(snapshot(), "o1");
    expect(p).toMatchObject({
      revenue: 40965.75,
      itemCost: 30500,
      expenses: 2000,
      totalCost: 32500,
      grossProfit: 8465.75,
      margin: 20.67,
      costsComplete: true,
    });
  });
  it("flags profit as provisional until every item has a vendor cost", () => {
    const s = snapshot();
    s.order_costs = s.order_costs.filter((c) => c.item_index !== 1);
    expect(orderProfit(s, "o1")).toMatchObject({ costedItems: 1, itemCount: 2, costsComplete: false });
  });
  it("leaves procurement without an order out of every order", () => {
    expect(orderProfit(snapshot(), "o2").expenses).toBe(0);
  });
});

const f = blankExpenseFilters;
describe("expense filters", () => {
  it("separates procurement and order expense views", () => {
    const s = snapshot();
    expect(filterExpenses(s, f(), "procurement").map((e) => e.description)).toEqual(["Blank notebooks"]);
    expect(filterExpenses(s, f(), "order")).toHaveLength(3);
  });
  it("filters by date, category, vendor, order and unlinked records", () => {
    const s = snapshot();
    expect(filterExpenses(s, { ...f(), from: "2026-10-02", to: "2026-10-31" })).toHaveLength(2);
    expect(filterExpenses(s, { ...f(), category: "Samples" })).toHaveLength(1);
    expect(filterExpenses(s, { ...f(), vendorId: "v1" })).toHaveLength(2);
    expect(filterExpenses(s, { ...f(), vendorId: NO_LINK })).toHaveLength(2);
    expect(filterExpenses(s, { ...f(), orderId: NO_LINK })).toHaveLength(1);
    expect(filterExpenses(s, { ...f(), clientId: "c1" })).toHaveLength(3);
    expect(filterExpenses(s, { ...f(), search: "bluedart" })).toHaveLength(1);
    expect(filterExpenses(s, { ...f(), search: "O-2026-0001" })).toHaveLength(3);
  });
  it("lists the newest expense first", () => {
    expect(filterExpenses(snapshot(), f()).map((e) => e.expense_date)).toEqual([
      "2026-10-04", "2026-10-04", "2026-10-01", "2026-09-15",
    ]);
  });
});

describe("expense reporting", () => {
  it("totals categories in paise", () => {
    const rows = totalsByCategory(snapshot().expenses);
    expect(rows.find((r) => r.category === "Logistics")).toMatchObject({ total: 1200, count: 1, share: 26.67 });
    expect(rows.map((r) => r.category)).not.toContain("Printing");
  });
  it("combines vendor expenses with assigned order item costs", () => {
    const s = snapshot();
    const rows = vendorSpend(s, s.expenses, f());
    expect(rows[0]).toMatchObject({ vendorId: "v1", expenses: 2800, itemCost: 20500, total: 23300 });
    expect(rows.find((r) => r.vendorId === NO_LINK)).toMatchObject({ expenses: 1700, itemCost: 0 });
    expect(vendorSpend(s, [], { ...f(), from: "2026-10-01" })).toEqual([]);
  });
  it("builds a P&L from issued invoices, item costs and dated expenses", () => {
    const pnl = profitAndLoss(snapshot(), "2026-10-01", "2026-10-31");
    expect(pnl.revenue).toBe(40965.75);
    expect(pnl.lines).toEqual([
      { group: "cogs", label: "Cost of goods / procurement", amount: 30500 },
      { group: "logistics", label: "Logistics", amount: 1200 },
      { group: "operational", label: "Operational expenses", amount: 800 },
      { group: "other", label: "Other expenses", amount: 0 },
    ]);
    expect(pnl.profit).toBe(8465.75);
    // September has only the unlinked procurement purchase.
    expect(profitAndLoss(snapshot(), "2026-09-01", "2026-09-30")).toMatchObject({ revenue: 0, totalCosts: 2500, profit: -2500, margin: null });
  });
  it("uses the April–March financial year", () => {
    expect(periodRange("fy", "2026-10-06")).toEqual({ from: "2026-04-01", to: "2027-03-31", label: "FY 2026–27" });
    expect(periodRange("fy", "2027-02-10").label).toBe("FY 2026–27");
    expect(periodRange("last_fy", "2026-04-01")).toMatchObject({ from: "2025-04-01", to: "2026-03-31" });
    expect(periodRange("quarter", "2026-10-06")).toEqual({ from: "2026-10-01", to: "2026-12-31", label: "Q3 FY 2026–27" });
    expect(periodRange("quarter", "2027-01-15").label).toBe("Q4 FY 2026–27");
    expect(periodRange("last_month", "2026-03-10")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("last_month", "2026-01-10")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

describe("expense input", () => {
  const key = crypto.randomUUID();
  const payload = {
    order_id: null, vendor_id: null, category: "Procurement", amount: 2500,
    expense_date: "2026-10-06", payee: "", payment_method: "UPI",
    description: "", receipt_path: "", receipt_name: "",
  };
  it("accepts a procurement expense without an order", () =>
    expect(validateMutation({ action: "save_expense", payload, key }).payload).toMatchObject(payload));
  it("rejects unknown categories, zero amounts and arbitrary receipt paths", () => {
    for (const bad of [
      { category: "Salary" },
      { amount: 0 },
      { receipt_path: "../artwork/secret.pdf" },
    ])
      expect(() => validateMutation({ action: "save_expense", payload: { ...payload, ...bad }, key })).toThrow();
  });
});
