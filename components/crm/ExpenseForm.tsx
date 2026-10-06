"use client";
import { useRef, useState } from "react";
import type { Expense, Snapshot } from "@/lib/types";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/types";
import { today } from "@/lib/domain";
import type { Mutate } from "./use-crm";

const receiptTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export default function ExpenseForm({
  s,
  expense,
  orderId,
  mutate,
  busy,
  onDone,
}: {
  s: Snapshot;
  expense?: Expense;
  orderId?: string;
  mutate: Mutate;
  busy: boolean;
  onDone: (id: string) => void;
}) {
  const [v, setV] = useState({
    category: expense?.category ?? (orderId ? "Logistics" : "Procurement"),
    amount: expense ? String(Number(expense.amount)) : "",
    expense_date: expense?.expense_date ?? today(),
    payment_method: expense?.payment_method ?? "Bank Transfer",
    vendor_id: expense?.vendor_id ?? "",
    payee: expense?.payee ?? "",
    order_id: expense?.order_id ?? orderId ?? "",
    description: expense?.description ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // A failed save must not upload the same receipt twice on retry.
  const uploaded = useRef<{ file: File; path: string } | null>(null);
  const set = (key: keyof typeof v) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setV({ ...v, [key]: e.target.value });
  const vendors = s.vendors.filter((x) => !x.archived || x.id === v.vendor_id);
  const orders = s.orders
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          let receipt_path = removeReceipt ? "" : (expense?.receipt_path ?? "");
          let receipt_name = removeReceipt ? "" : (expense?.receipt_name ?? "");
          if (file) {
            if (uploaded.current?.file !== file) {
              setUploading(true);
              const body = new FormData();
              body.set("file", file);
              const r = await fetch("/api/expense-receipt", { method: "POST", body });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error || "Could not upload receipt");
              uploaded.current = { file, path: data.path };
              setUploading(false);
            }
            receipt_path = uploaded.current!.path;
            receipt_name = file.name.slice(0, 200);
          }
          const r = await mutate("save_expense", {
            ...(expense ? { id: expense.id } : {}),
            ...v,
            amount: Number(v.amount),
            vendor_id: v.vendor_id || null,
            order_id: v.order_id || null,
            receipt_path,
            receipt_name,
          });
          onDone(r.id);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not save expense");
        } finally {
          setUploading(false);
        }
      }}
    >
      <div className="field-grid">
        <label>
          Category
          <select required value={v.category} onChange={set("category")}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Amount (INR)
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={v.amount}
            onChange={set("amount")}
          />
        </label>
        <label>
          Expense date
          <input required type="date" value={v.expense_date} onChange={set("expense_date")} />
        </label>
        <label>
          Payment method
          <select value={v.payment_method} onChange={set("payment_method")}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Vendor (optional)
          <select value={v.vendor_id} onChange={set("vendor_id")}>
            <option value="">No vendor</option>
            {vendors.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Payee (if not a listed vendor)
          <input
            maxLength={200}
            placeholder="Courier, transporter, shop…"
            value={v.payee}
            onChange={set("payee")}
          />
        </label>
        <label className="wide">
          Order (optional)
          <select value={v.order_id} onChange={set("order_id")}>
            <option value="">Not linked to an order</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.ref} · {o.title}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          Description / notes
          <textarea
            maxLength={2000}
            placeholder="What was bought or paid for, bill number, quantity…"
            value={v.description}
            onChange={set("description")}
          />
        </label>
        <label className="wide">
          {expense?.receipt_path && !removeReceipt ? "Replace receipt / invoice" : "Receipt / invoice (optional)"}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              setError(
                next && ((next.type && !receiptTypes.includes(next.type)) || next.size > 5242880)
                  ? "Choose a PDF, JPG, PNG or WebP receipt up to 5 MB"
                  : "",
              );
              setFile(next);
            }}
          />
          <small>PDF, JPG, PNG or WebP · up to 5 MB</small>
        </label>
        {expense?.receipt_path && !file && (
          <div className="wide row" style={{ gap: 14 }}>
            {!removeReceipt && (
              <a
                className="text-link"
                href={`/api/expense-receipt?id=${expense.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {expense.receipt_name || "Receipt"}
              </a>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={removeReceipt}
                onChange={(e) => setRemoveReceipt(e.target.checked)}
              />
              Remove the attached receipt
            </label>
          </div>
        )}
      </div>
      <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        Record costs beyond the product or vendor cost entered against order
        items, so nothing is counted twice. This records money already spent;
        it does not make a payment.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button disabled={busy || uploading} className="button primary">
          {uploading ? "Uploading receipt…" : busy ? "Saving…" : expense ? "Save expense" : "Add expense"}
        </button>
      </div>
    </form>
  );
}
