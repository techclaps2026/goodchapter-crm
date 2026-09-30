"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { Upload, FileText, ExternalLink } from "lucide-react";
import type { Snapshot, Order } from "@/lib/types";
import { ORDER_STAGES } from "@/lib/types";
import { money, orderMoney, dateLabel } from "@/lib/domain";
import type { Mutate } from "./use-crm";
import { Badge } from "./shared";
export default function OrderDetail({
  s,
  order: o,
  mutate,
  busy,
  refresh,
  onPayment,
  onInvoice,
}: {
  s: Snapshot;
  order: Order;
  mutate: Mutate;
  busy: boolean;
  refresh: () => Promise<unknown>;
  onPayment: () => void;
  onInvoice: (id: string) => void;
}) {
  const [form, setForm] = useState({ ...o });
  const [error, setError] = useState("");
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>(
    {},
  );
  const [uploading, setUploading] = useState(false);
  const uploadKey = useRef(crypto.randomUUID());
  const q = s.documents.find((d) => d.id === o.quote_id)!;
  const invoice = s.documents.find(
    (d) => d.order_id === o.id && d.kind === "invoice",
  );
  const m = orderMoney(s, o.id);
  const versions = s.artwork
    .filter((a) => a.order_id === o.id)
    .sort((a, b) => b.version - a.version);
  const disabled = o.status === "Cancelled";
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };
  return (
    <>
      <div className="progress-steps">
        {ORDER_STAGES.filter((s) => s !== "Cancelled").map((stage, i) => (
          <div
            key={stage}
            className={
              "progress-step " +
              (o.status === stage
                ? "current"
                : ORDER_STAGES.indexOf(o.status) > i && o.status !== "Cancelled"
                  ? "complete"
                  : "")
            }
          >
            <span className="mono">0{i + 1}</span>
            <br />
            {stage}
          </div>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="detail-grid">
        <div className="stack">
          <section className="panel">
            <div className="section-title">
              <h2>Order brief</h2>
              <Link className="text-link" href={"/quotations/" + q.id}>
                View accepted quote ↗
              </Link>
            </div>
            <p>
              {q.customer.organisation || q.customer.name} ·{" "}
              {q.items.reduce((n, i) => n + i.quantity, 0)} units
            </p>
            <div className="divider" />
            {q.items.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div className="row between">
                  <h3>{item.description}</h3>
                  <span className="mono">
                    {item.quantity} × {money(item.unit_price)}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    margin: "7px 0 12px",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {item.details}
                </p>
                <div className="field-grid">
                  <label>
                    Production vendor
                    <select
                      disabled={busy || disabled}
                      value={
                        s.order_vendors.find(
                          (v) => v.order_id === o.id && v.item_index === i,
                        )?.vendor_id ?? ""
                      }
                      onChange={(e) =>
                        run(() =>
                          mutate("assign_vendor", {
                            order_id: o.id,
                            item_index: i,
                            vendor_id: e.target.value || null,
                          }),
                        )
                      }
                    >
                      <option value="">Not assigned</option>
                      {s.vendors
                        .filter((v) => !v.archived)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {s.profile.role === "owner" && (
                    <label>
                      Total vendor cost · owner only
                      <input
                        type="number"
                        step=".01"
                        min="0"
                        disabled={disabled || busy}
                        defaultValue={
                          s.order_costs.find(
                            (c) => c.order_id === o.id && c.item_index === i,
                          )?.amount ?? ""
                        }
                        onBlur={(e) => {
                          if (e.target.value)
                            run(() =>
                              mutate("save_cost", {
                                order_id: o.id,
                                item_index: i,
                                amount: Number(e.target.value),
                              }),
                            );
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="section-title">
              <h2>Artwork & approvals</h2>
              <span className="eyebrow">VERSION HISTORY</span>
            </div>
            <p style={{ fontSize: 12, marginBottom: 18 }}>
              Approval applies to the latest version. A new upload returns the
              order to Design & Approval.
            </p>
            {versions.map((a, i) => (
              <div
                key={a.id}
                className="stack"
                style={{
                  gap: 10,
                  borderTop: "1px solid var(--border)",
                  padding: "16px 0",
                }}
              >
                <div className="row between">
                  <a
                    className="text-link row"
                    href={
                      "/api/artwork?path=" + encodeURIComponent(a.storage_path)
                    }
                  >
                    <FileText size={15} />v{a.version} · {a.file_name}
                    <ExternalLink size={12} />
                  </a>
                  <Badge>{a.status}</Badge>
                </div>
                <p style={{ fontSize: 12 }}>
                  {a.notes}
                  {a.approved_at && ` · Approved ${dateLabel(a.approved_at)}`}
                </p>
                {i === 0 && !disabled && o.status !== "Delivered" && (
                  <label>
                    Approval notes
                    <textarea
                      value={approvalNotes[a.id] ?? a.notes}
                      onChange={(e) =>
                        setApprovalNotes({
                          ...approvalNotes,
                          [a.id]: e.target.value,
                        })
                      }
                      placeholder="Client confirmation, date and feedback"
                    />
                  </label>
                )}
                {i === 0 && !disabled && o.status !== "Delivered" && (
                  <div className="row">
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          mutate("review_artwork", {
                            id: a.id,
                            status: "Approved",
                            notes: approvalNotes[a.id] ?? a.notes,
                          }),
                        )
                      }
                    >
                      Record client approval
                    </button>
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          mutate("review_artwork", {
                            id: a.id,
                            status: "Changes requested",
                            notes: approvalNotes[a.id] ?? a.notes,
                          }),
                        )
                      }
                    >
                      Changes requested
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!versions.length && (
              <p style={{ marginBottom: 18 }}>No artwork attached yet.</p>
            )}
            {!disabled && o.status !== "Delivered" && (
              <form
                className="stack"
                style={{ gap: 12 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const el = e.currentTarget;
                  setUploading(true);
                  setError("");
                  try {
                    const fd = new FormData(el);
                    fd.set("order_id", o.id);
                    fd.set("key", uploadKey.current);
                    const r = await fetch("/api/artwork", {
                      method: "POST",
                      body: fd,
                    });
                    const data = await r.json();
                    if (!r.ok) throw new Error(data.error);
                    uploadKey.current = crypto.randomUUID();
                    el.reset();
                    setForm((current) => ({
                      ...current,
                      status: "Design & Approval",
                      approval_not_required: false,
                    }));
                    await refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Upload failed");
                  } finally {
                    setUploading(false);
                  }
                }}
              >
                <label>
                  New version · PNG, JPG, WebP or PDF, max 4 MB
                  <input
                    name="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    required
                    onChange={() => (uploadKey.current = crypto.randomUUID())}
                  />
                </label>
                <label>
                  Version / approval notes
                  <textarea
                    name="notes"
                    placeholder="What changed, or the client’s feedback"
                  />
                </label>
                <button className="button" disabled={uploading}>
                  <Upload size={15} />
                  {uploading ? "Uploading…" : "Attach new version"}
                </button>
              </form>
            )}
          </section>
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                mutate("save_order", {
                  id: o.id,
                  status: form.status,
                  required_date: form.required_date || null,
                  shipping_address: form.shipping_address,
                  courier: form.courier,
                  tracking_ref: form.tracking_ref,
                  dispatched_on: form.dispatched_on || null,
                  delivered_on: form.delivered_on || null,
                  approval_not_required: form.approval_not_required,
                  notes: form.notes,
                }),
              );
            }}
          >
            <h2 style={{ marginBottom: 18 }}>Production & delivery</h2>
            <div className="field-grid">
              <label>
                Status
                <select
                  disabled={disabled}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {ORDER_STAGES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Delivery deadline
                <input
                  disabled={disabled}
                  type="date"
                  value={form.required_date ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, required_date: e.target.value })
                  }
                />
              </label>
              <label className="wide check">
                <input
                  disabled={disabled}
                  type="checkbox"
                  checked={form.approval_not_required}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      approval_not_required: e.target.checked,
                    })
                  }
                />
                Artwork approval not required for this order
              </label>
              <label className="wide">
                Shipping address
                <textarea
                  disabled={disabled}
                  value={form.shipping_address}
                  onChange={(e) =>
                    setForm({ ...form, shipping_address: e.target.value })
                  }
                />
              </label>
              {(
                [
                  "courier",
                  "tracking_ref",
                  "dispatched_on",
                  "delivered_on",
                ] as const
              ).map((k) => (
                <label key={k}>
                  {
                    {
                      courier: "Courier",
                      tracking_ref: "Tracking reference",
                      dispatched_on: "Dispatch date",
                      delivered_on: "Delivery date",
                    }[k]
                  }
                  <input
                    disabled={disabled}
                    type={k.endsWith("_on") ? "date" : "text"}
                    value={form[k] ?? ""}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </label>
              ))}
              <label className="wide">
                Internal notes
                <textarea
                  disabled={disabled}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="form-footer">
              <button className="button primary" disabled={disabled || busy}>
                Save order updates
              </button>
            </div>
          </form>
        </div>
        <aside className="stack">
          <section className="panel">
            <div className="eyebrow">ORDER VALUE</div>
            <h1 style={{ fontSize: 30, margin: "15px 0" }}>{money(m.total)}</h1>
            <div className="divider" />
            <div className="row between">
              <span>Received, net of refunds</span>
              <strong>{money(m.paid)}</strong>
            </div>
            <div className="row between" style={{ marginTop: 12 }}>
              <span>{m.balance < 0 ? "Credit" : "Balance due"}</span>
              <strong>{money(Math.abs(m.balance))}</strong>
            </div>
            <button
              className="button primary"
              style={{ width: "100%", marginTop: 22 }}
              onClick={onPayment}
            >
              Record payment
            </button>
            <div className="divider" />
            {invoice ? (
              <Link className="text-link" href={"/invoices/" + invoice.id}>
                {invoice.ref} · {invoice.status} ↗
              </Link>
            ) : (
              <button
                disabled={disabled || busy}
                className="button"
                onClick={() =>
                  run(async () => {
                    const r = await mutate("create_invoice", {
                      id: o.id,
                      due_on: o.required_date,
                    });
                    onInvoice(r.id);
                  })
                }
              >
                Create invoice
              </button>
            )}
          </section>
          <section className="panel">
            <h3>Payment history</h3>
            {s.payments
              .filter((p) => p.order_id === o.id)
              .map((p) => (
                <div
                  key={p.id}
                  style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: 14,
                    marginTop: 14,
                  }}
                >
                  <div className="row between">
                    <strong>
                      {p.kind === "Refund" ? "−" : ""}
                      {money(p.amount)}
                    </strong>
                    <span className="mono">{dateLabel(p.payment_date)}</span>
                  </div>
                  <p style={{ fontSize: 11 }}>
                    {p.method} · {p.reference || p.kind}
                  </p>
                </div>
              ))}
          </section>
        </aside>
      </div>
    </>
  );
}
