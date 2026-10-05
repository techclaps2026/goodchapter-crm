"use client";
import { useState, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { Upload, FileText, ExternalLink, Download, Copy, ArrowUpRight } from "lucide-react";
import type { Snapshot, Order } from "@/lib/types";
import { ORDER_STAGES, hasOwnerAccess } from "@/lib/types";
import { money, orderMoney, dateLabel } from "@/lib/domain";
import type { Mutate } from "./use-crm";
import { Badge } from "./shared";
import { orderSizeChoices, orderSizesWorkbook } from "@/lib/order-sizes";
import PaymentReceiptActions from "./PaymentReceiptActions";
const subscribeOrigin = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => "";
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
  const sizeForm = s.order_size_forms.find(
    (record) => record.order_id === o.id,
  );
  const [selectedSizeItems, setSelectedSizeItems] = useState(
    sizeForm?.items ?? [],
  );
  const [sizeBusy, setSizeBusy] = useState(false);
  const [sizeMessage, setSizeMessage] = useState("");
  const [sizeError, setSizeError] = useState("");
  const sizeOrigin = useSyncExternalStore(
    subscribeOrigin,
    clientOrigin,
    serverOrigin,
  );
  const uploadKey = useRef(crypto.randomUUID());
  const q = s.documents.find((d) => d.id === o.quote_id)!;
  const sizeChoices = orderSizeChoices(q.items);
  const savedSizeItems = sizeForm?.items ?? [];
  const unlistedSizeItems = savedSizeItems.filter(
    (item) => !sizeChoices.some((choice) => choice.label === item),
  );
  const invoice = s.documents.find(
    (d) =>
      d.order_id === o.id && d.kind === "invoice" && d.status !== "Superseded",
  );
  const m = orderMoney(s, o.id);
  const versions = s.artwork
    .filter((a) => a.order_id === o.id)
    .sort((a, b) => b.version - a.version);
  const disabled = o.status === "Cancelled";
  const configureSizes = async (enabled: boolean) => {
    setSizeBusy(true);
    setSizeMessage("");
    setSizeError("");
    try {
      const items = enabled
        ? sizeChoices
            .filter((choice) => selectedSizeItems.includes(choice.label))
            .map((choice) => choice.label)
        : savedSizeItems;
      const response = await fetch("/api/order-sizes/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: o.id, items, enabled }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not save size form");
      setSelectedSizeItems(result.items);
      await refresh();
      setSizeMessage(
        enabled ? "Size form ready to share." : "Size link closed.",
      );
    } catch (cause) {
      setSizeError(
        cause instanceof Error ? cause.message : "Could not save size form",
      );
    } finally {
      setSizeBusy(false);
    }
  };
  const exportSizes = () => {
    if (!sizeForm) return;
    const bytes = orderSizesWorkbook(sizeForm.entries);
    const href = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = `${o.ref.replace(/[^a-zA-Z0-9_-]/g, "-")}-sizes.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
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
                View accepted quote <ArrowUpRight className="inline-arrow" aria-hidden="true" />
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
                  {hasOwnerAccess(s.profile.role) && (
                    <label>
                      Total vendor cost · admin access
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
              <h2>Client sizes</h2>
              <span className="eyebrow">{sizeForm?.entries.length ?? 0} SAVED</span>
            </div>
            <p style={{ marginBottom: 16 }}>
              Create a private form for the client to add names and sizes.
              Download one consolidated sheet to give the vendor for printing.
            </p>
            <div className="order-size-choices" role="group" aria-label="Order items that need sizes">
              <p className="order-size-choices-title">Select the order items that need sizes</p>
              {sizeChoices.length ? sizeChoices.map((choice, index) => (
                <label className="order-size-choice" key={`${choice.label}-${index}`}>
                  <input
                    type="checkbox"
                    checked={selectedSizeItems.includes(choice.label)}
                    disabled={sizeBusy || disabled}
                    onChange={(event) => {
                      setSelectedSizeItems((selected) => event.target.checked
                        ? [...selected, choice.label]
                        : selected.filter((item) => item !== choice.label));
                      setSizeError("");
                    }}
                  />
                  <span className="order-size-choice-copy">
                    <strong>{choice.description}</strong>
                    {choice.details && <small>{choice.details}</small>}
                  </span>
                  <span className="order-size-choice-quantity">{choice.quantity} units</span>
                </label>
              )) : <p className="order-size-choices-empty">Add items to the order to collect sizes.</p>}
            </div>
            {unlistedSizeItems.length > 0 && (
              <p className="order-size-legacy-note">
                This form already has size categories outside the order: {unlistedSizeItems.join(", ")}.
                Existing responses are preserved. Categories with submitted sizes cannot be removed from this form.
              </p>
            )}
            <div className="row" style={{ marginTop: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button primary"
                disabled={sizeBusy || disabled || !selectedSizeItems.length || !sizeChoices.length}
                onClick={() => configureSizes(true)}
              >
                {sizeBusy
                  ? "Saving…"
                  : sizeForm?.enabled
                    ? "Save size form"
                    : "Create share link"}
              </button>
              {sizeForm?.enabled && (
                <button
                  type="button"
                  className="button"
                  disabled={sizeBusy}
                  onClick={() => configureSizes(false)}
                >
                  Close link
                </button>
              )}
              <button
                type="button"
                className="button"
                disabled={!sizeForm || sizeBusy}
                onClick={async () => {
                  setSizeBusy(true);
                  try {
                    await refresh();
                    setSizeMessage("Size list updated.");
                  } catch (cause) {
                    setSizeError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not refresh sizes",
                    );
                  } finally {
                    setSizeBusy(false);
                  }
                }}
              >
                {sizeBusy ? "Refreshing…" : "Refresh sizes"}
              </button>
              <button
                type="button"
                className="button"
                disabled={!sizeForm?.entries.length}
                onClick={exportSizes}
              >
                <Download size={15} /> Download vendor sheet
              </button>
            </div>
            {sizeForm?.enabled && (
              <div className="sizes-share-link">
                <label>
                  Client link
                  <input
                    readOnly
                    value={`${sizeOrigin}/sizes/${sizeForm.share_token}`}
                  />
                </label>
                <button
                  type="button"
                  className="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/sizes/${sizeForm.share_token}`,
                    );
                    setSizeMessage("Link copied.");
                  }}
                >
                  <Copy size={15} /> Copy link
                </button>
              </div>
            )}
            <p style={{ marginTop: 12, fontSize: 12 }}>
              Anyone with the link can view and edit submitted names and phone
              numbers. Reopening a closed link creates a new link.
            </p>
            {sizeError && (
              <p className="form-error" role="alert">
                {sizeError}
              </p>
            )}
            {sizeMessage && (
              <p className="form-success" role="status">
                {sizeMessage}
              </p>
            )}
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
                  New version · PNG, JPG, WebP, PDF or XLSX, max 4 MB
                  <input
                    name="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
                {invoice.ref} · {invoice.status} <ArrowUpRight className="inline-arrow" aria-hidden="true" />
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
                  <PaymentReceiptActions payment={p} snapshot={s} />
                </div>
              ))}
          </section>
        </aside>
      </div>
    </>
  );
}
