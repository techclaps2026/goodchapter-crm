"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Expense, Snapshot } from "@/lib/types";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/types";
import { money, dateLabel, today } from "@/lib/domain";
import {
  NO_LINK,
  PERIOD_LABELS,
  blankExpenseFilters,
  expenseTotal,
  filterExpenses,
  monthLabel,
  monthRange,
  monthsBetween,
  periodRange,
  profitAndLoss,
  totalsByCategory,
  vendorSpend,
  type ExpenseFilters,
  type PeriodKind,
} from "@/lib/expenses";
import { Badge, table } from "./shared";

const VIEWS = [
  ["all", "All expenses"],
  ["procurement", "Procurement"],
  ["order", "Order expenses"],
  ["vendors", "Vendors"],
  ["reports", "Reports"],
] as const;
type View = (typeof VIEWS)[number][0];
const percentLabel = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;

export default function Expenses({
  s,
  rowActions,
}: {
  s: Snapshot;
  rowActions: (expense: Expense) => React.ReactNode;
}) {
  const [view, setView] = useState<View>("all");
  const [f, setF] = useState<ExpenseFilters>(blankExpenseFilters);
  const listView = view === "procurement" || view === "order" ? view : "all";
  const rows = filterExpenses(s, f, listView);
  const vendorName = (id: string | null) =>
    s.vendors.find((v) => v.id === id)?.name;
  const orderOf = (id: string | null) => s.orders.find((o) => o.id === id);
  const clientName = (id: string | undefined) => {
    const c = s.clients.find((x) => x.id === id);
    return c?.organisation || c?.name || "";
  };
  const set = (key: keyof ExpenseFilters) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF({ ...f, [key]: e.target.value });
  const filtered = Object.values(f).some(Boolean);
  return (
    <div className="stack">
      <div className="mail-tabs expense-tabs" role="tablist" aria-label="Expense views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "reports" ? (
        <ExpenseReports s={s} />
      ) : (
        <>
          <div className="expense-filters" role="search" aria-label="Filter expenses">
            <label className="expense-filter-search">
              Search
              <span className="search">
                <Search aria-hidden="true" />
                <input
                  placeholder="Description, payee, vendor or order…"
                  value={f.search}
                  onChange={set("search")}
                />
              </span>
            </label>
            <label>
              From
              <input type="date" value={f.from} max={f.to || undefined} onChange={set("from")} />
            </label>
            <label>
              To
              <input type="date" value={f.to} min={f.from || undefined} onChange={set("to")} />
            </label>
            <label>
              Category
              <select value={f.category} onChange={set("category")}>
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Vendor
              <select value={f.vendorId} onChange={set("vendorId")}>
                <option value="">All vendors</option>
                <option value={NO_LINK}>No vendor linked</option>
                {s.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Order
              <select value={f.orderId} onChange={set("orderId")}>
                <option value="">All orders</option>
                <option value={NO_LINK}>Not linked to an order</option>
                {s.orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.ref} · {o.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Client
              <select value={f.clientId} onChange={set("clientId")}>
                <option value="">All clients</option>
                {s.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.organisation || c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payment method
              <select value={f.method} onChange={set("method")}>
                <option value="">All methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            {filtered && (
              <button
                type="button"
                className="button small expense-filter-clear"
                onClick={() => setF(blankExpenseFilters())}
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="stats">
            {[
              ["TOTAL", money(expenseTotal(rows)), `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`],
              ["PROCUREMENT", money(expenseTotal(rows.filter((e) => e.category === "Procurement"))), "Stock, material and purchases"],
              ["LINKED TO ORDERS", money(expenseTotal(rows.filter((e) => e.order_id))), "Counted in order profitability"],
              ["WITHOUT RECEIPT", String(rows.filter((e) => !e.receipt_path).length), "Attach a bill or invoice"],
            ].map(([label, value, caption]) => (
              <div className="stat" key={label}>
                <div className="eyebrow">{label}</div>
                <div className="value">{value}</div>
                <div className="caption">{caption}</div>
              </div>
            ))}
          </div>
          {view === "vendors"
            ? (() => {
                const spend = vendorSpend(s, rows, f);
                return (
                  <>
                    {table(
                      ["Vendor / payee", "Expense entries", "Expenses", "Order item costs", "Total spend"],
                      spend.map((r) => [
                        <strong key="v">{r.name}</strong>,
                        String(r.expenseCount),
                        money(r.expenses),
                        money(r.itemCost),
                        <strong key="t">{money(r.total)}</strong>,
                      ]),
                      "No vendor spend recorded",
                    )}
                    <p style={{ fontSize: 12 }}>
                      Order item costs are the vendor costs entered against order
                      lines assigned to that vendor, dated by the order’s creation
                      date. Expenses without a linked vendor are grouped together.
                    </p>
                  </>
                );
              })()
            : table(
                ["Date", "Category", "Details", "Vendor / payee", "Order", "Method", "Amount", "Receipt", ""],
                rows.map((e) => {
                  const order = orderOf(e.order_id);
                  return [
                    dateLabel(e.expense_date),
                    <Badge key="c">{e.category}</Badge>,
                    <span key="d" className="expense-details">{e.description || "—"}</span>,
                    vendorName(e.vendor_id) ?? (e.payee || "—"),
                    order ? (
                      <Link key="o" className="text-link" href={`/orders/${order.id}`}>
                        {order.ref}
                        <small>{clientName(order.client_id)}</small>
                      </Link>
                    ) : (
                      "—"
                    ),
                    e.payment_method,
                    <strong key="a">{money(e.amount)}</strong>,
                    e.receipt_path ? (
                      <a
                        key="r"
                        className="text-link"
                        href={`/api/expense-receipt?id=${e.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    ),
                    rowActions(e),
                  ];
                }),
                view === "procurement"
                  ? "No procurement expenses"
                  : view === "order"
                    ? "No order expenses"
                    : "No expenses recorded",
                "expense-table",
              )}
        </>
      )}
    </div>
  );
}

function ExpenseReports({ s }: { s: Snapshot }) {
  const [period, setPeriod] = useState<PeriodKind | "custom">("fy");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const now = today();
  const range: { from: string; to: string; label?: string } =
    period === "custom" ? custom : periodRange(period, now);
  const pnl = profitAndLoss(s, range.from, range.to);
  const inRange = (d: string) =>
    (!range.from || d >= range.from) && (!range.to || d <= range.to);
  const categories = totalsByCategory(s.expenses.filter((e) => inRange(e.expense_date)));
  const dated = [
    ...s.expenses.map((e) => e.expense_date),
    ...s.documents
      .filter((d) => d.kind === "invoice" && d.status === "Issued" && d.issued_on)
      .map((d) => d.issued_on!),
  ].sort();
  const firstMonth = (range.from || dated[0] || now).slice(0, 7);
  const lastMonth = [range.to || now, now].sort()[0].slice(0, 7);
  const months = firstMonth <= lastMonth ? monthsBetween(firstMonth, lastMonth).reverse() : [];
  const caption =
    range.label ??
    (range.from || range.to
      ? `${range.from ? dateLabel(range.from) : "Start"} – ${range.to ? dateLabel(range.to) : "Today"}`
      : "All time");
  return (
    <>
      <div className="expense-filters">
        <label>
          Period
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKind | "custom")}
          >
            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <option value="custom">Custom range</option>
          </select>
        </label>
        {period === "custom" && (
          <>
            <label>
              From
              <input
                type="date"
                value={custom.from}
                max={custom.to || undefined}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={custom.to}
                min={custom.from || undefined}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      <div className="stats">
        {[
          ["REVENUE", money(pnl.revenue), "Issued invoices, before tax"],
          ["TOTAL COSTS", money(pnl.totalCosts), "Item costs and expenses"],
          [pnl.profit < 0 ? "LOSS" : "PROFIT", money(Math.abs(pnl.profit)), caption],
          ["MARGIN", percentLabel(pnl.margin), "Profit as a share of revenue"],
        ].map(([label, value, note]) => (
          <div className="stat" key={label}>
            <div className="eyebrow">{label}</div>
            <div className="value">{value}</div>
            <div className="caption">{note}</div>
          </div>
        ))}
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="section-title">
            <h2>Profit & loss</h2>
            <span className="eyebrow">{caption}</span>
          </div>
          <dl className="ledger">
            <div>
              <dt>Revenue</dt>
              <dd>{money(pnl.revenue)}</dd>
            </div>
            {pnl.lines.map((line) => (
              <div key={line.group}>
                <dt>
                  − {line.label}
                  {line.group === "cogs" && pnl.itemCost > 0 && (
                    <small>Includes {money(pnl.itemCost)} order item costs</small>
                  )}
                </dt>
                <dd>{money(line.amount)}</dd>
              </div>
            ))}
            <div className="ledger-total">
              <dt>{pnl.profit < 0 ? "Loss" : "Profit"}</dt>
              <dd>{money(pnl.profit)}</dd>
            </div>
          </dl>
        </section>
        <section>
          <div className="section-title">
            <h2>Expenses by category</h2>
          </div>
          {table(
            ["Category", "Entries", "Amount", "Share"],
            categories.map((c) => [
              <Badge key="c">{c.category}</Badge>,
              String(c.count),
              money(c.total),
              percentLabel(c.share),
            ]),
            "No expenses in this period",
          )}
        </section>
      </div>
      <section>
        <div className="section-title">
          <h2>Month by month</h2>
        </div>
        {table(
          ["Month", "Revenue", "Costs", "Profit / loss", "Margin"],
          months.map((month) => {
            const m = monthRange(month);
            const row = profitAndLoss(s, m.from, m.to);
            return [
              monthLabel(month),
              money(row.revenue),
              money(row.totalCosts),
              money(row.profit),
              percentLabel(row.margin),
            ];
          }),
          "No activity in this period",
        )}
      </section>
      <p style={{ fontSize: 12 }}>
        Revenue is the pre-tax subtotal of issued invoices dated in the period,
        excluding cancelled orders; those orders’ item costs count as cost of
        goods. Expenses count by their expense date: Procurement is cost of
        goods, Logistics and Transportation are logistics, Samples, Packaging
        and Printing are operational, and Miscellaneous is other. Periods follow
        the April–March financial year.
      </p>
    </>
  );
}
