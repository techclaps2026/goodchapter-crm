"use client";
import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import { CATEGORIES, LEAD_STAGES, hasOwnerAccess } from "@/lib/types";
import type { Action } from "@/lib/validation";
import type { Mutate } from "./use-crm";
import { today } from "@/lib/domain";
export type EntityKind =
  "lead" | "client" | "product" | "vendor" | "followup" | "payment";
type Values = Record<string, string | number | boolean | null>;
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  wide?: boolean;
};
const options = (a: string[]) => a.map((value) => ({ value, label: value }));
export default function EntityForm({
  kind,
  initial = {},
  s,
  mutate,
  onDone,
  busy,
}: {
  kind: EntityKind;
  initial?: Values;
  s: Snapshot;
  mutate: Mutate;
  onDone: (id: string) => void;
  busy: boolean;
}) {
  const refs = (
    rows: { id: string; name?: string; title?: string; ref?: string }[],
  ) =>
    rows.map((r) => ({
      value: r.id,
      label: [r.ref, r.name ?? r.title].filter(Boolean).join(" · "),
    }));
  const base = { name: "", organisation: "", email: "", phone: "", notes: "" };
  const defaults: Record<EntityKind, Values> = {
    client: { ...base, billing_address: "", shipping_address: "", gstin: "" },
    lead: {
      ...base,
      source: "Other",
      stage: "New",
      brief: "",
      quantity: null,
      budget: null,
      required_date: null,
      assigned_to: s.profile.id,
      client_id: null,
    },
    product: {
      name: "",
      category: "Apparel",
      description: "",
      customisation: "",
      image_url: "",
      unit_price: 0,
    },
    vendor: {
      name: "",
      category: "Apparel",
      contact_name: "",
      email: "",
      phone: "",
      city: "",
      notes: "",
    },
    followup: {
      title: "",
      lead_id: null,
      client_id: null,
      order_id: null,
      assigned_to: s.profile.id,
      due_at: "",
      done: false,
      priority: "Medium",
      notes: "",
    },
    payment: {
      order_id: null,
      amount: 0,
      kind: "Receipt",
      method: "Bank Transfer",
      payment_date: today(),
      reference: "",
      notes: "",
    },
  };
  const [v, setV] = useState<Values>({ ...defaults[kind], ...initial });
  const [error, setError] = useState("");
  const contact: Field[] = [
    { key: "name", label: "Contact name", required: true },
    { key: "organisation", label: "Organisation" },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone" },
  ];
  const fields: Record<EntityKind, Field[]> = {
    client: [
      ...contact,
      {
        key: "billing_address",
        label: "Billing address",
        type: "textarea",
        wide: true,
      },
      {
        key: "shipping_address",
        label: "Shipping address",
        type: "textarea",
        wide: true,
      },
      { key: "gstin", label: "GSTIN (optional)" },
      { key: "notes", label: "Internal notes", type: "textarea", wide: true },
    ],
    lead: [
      ...contact,
      {
        key: "source",
        label: "Source",
        options: options([
          "Website",
          "Referral",
          "Instagram",
          "WhatsApp",
          "Walk-in",
          "Other",
        ]),
      },
      { key: "stage", label: "Stage", options: options(LEAD_STAGES) },
      {
        key: "brief",
        label: "Merchandise brief",
        type: "textarea",
        wide: true,
      },
      { key: "quantity", label: "Estimated quantity", type: "number" },
      { key: "budget", label: "Budget (INR)", type: "number" },
      { key: "required_date", label: "Required by", type: "date" },
      {
        key: "assigned_to",
        label: "Owner",
        options: s.profiles
          .filter((p) => p.active)
          .map((p) => ({ value: p.id, label: p.full_name })),
      },
      { key: "client_id", label: "Linked client", options: refs(s.clients) },
      { key: "notes", label: "Internal notes", type: "textarea", wide: true },
    ],
    product: [
      { key: "name", label: "Product name", required: true },
      { key: "category", label: "Category", options: options(CATEGORIES) },
      {
        key: "description",
        label: "Description",
        type: "textarea",
        wide: true,
      },
      {
        key: "customisation",
        label: "Customisation options",
        type: "textarea",
        wide: true,
      },
      {
        key: "unit_price",
        label: "Indicative unit price (INR)",
        type: "number",
        required: true,
      },
      { key: "image_url", label: "Image URL (HTTPS)", type: "url" },
    ],
    vendor: [
      { key: "name", label: "Vendor name", required: true },
      { key: "category", label: "Speciality", options: options(CATEGORIES) },
      { key: "contact_name", label: "Contact person" },
      { key: "city", label: "City" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone" },
      {
        key: "notes",
        label: "Operational notes",
        type: "textarea",
        wide: true,
      },
    ],
    followup: [
      { key: "title", label: "Follow-up", required: true, wide: true },
      {
        key: "due_at",
        label: "Due at (your local time)",
        type: "datetime-local",
        required: true,
      },
      {
        key: "priority",
        label: "Priority",
        options: options(["High", "Medium", "Low"]),
      },
      {
        key: "assigned_to",
        label: "Assigned to",
        options: s.profiles
          .filter((p) => p.active)
          .map((p) => ({ value: p.id, label: p.full_name })),
      },
      { key: "lead_id", label: "Lead", options: refs(s.leads) },
      { key: "client_id", label: "Client", options: refs(s.clients) },
      { key: "order_id", label: "Order", options: refs(s.orders) },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
    ],
    payment: [
      {
        key: "order_id",
        label: "Order",
        required: true,
        options: refs(s.orders),
      },
      { key: "amount", label: "Amount (INR)", type: "number", required: true },
      {
        key: "kind",
        label: "Entry type",
        options: options(
          hasOwnerAccess(s.profile.role) ? ["Receipt", "Refund"] : ["Receipt"],
        ),
      },
      {
        key: "method",
        label: "Payment method",
        options: options([
          "UPI",
          "Bank Transfer",
          "Cash",
          "Card",
          "Cheque",
          "Other",
        ]),
      },
      {
        key: "payment_date",
        label: "Payment date",
        type: "date",
        required: true,
      },
      { key: "reference", label: "Transaction reference" },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  };
  const action = (
    kind === "payment" ? "log_payment" : `save_${kind}`
  ) as Action;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const payload: Values = {};
          Object.keys(defaults[kind]).forEach((k) => (payload[k] = v[k]));
          if (initial.id) payload.id = initial.id;
          if (kind === "followup")
            payload.due_at = new Date(String(v.due_at)).toISOString();
          const r = await mutate(action, payload);
          onDone(r.id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save");
        }
      }}
    >
      <div className="field-grid">
        {fields[kind].map((f) => (
          <label key={f.key} className={f.wide ? "wide" : ""}>
            {f.label}
            {f.options ? (
              <select
                value={String(v[f.key] ?? "")}
                required={f.required}
                onChange={(e) =>
                  setV({ ...v, [f.key]: e.target.value || null })
                }
              >
                <option value="">Select…</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                value={String(v[f.key] ?? "")}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
              />
            ) : (
              <input
                required={f.required}
                type={f.type ?? "text"}
                min={f.type === "number" ? 0 : undefined}
                step={
                  f.type === "number"
                    ? f.key === "quantity"
                      ? 1
                      : 0.01
                    : undefined
                }
                value={String(v[f.key] ?? "")}
                onChange={(e) =>
                  setV({
                    ...v,
                    [f.key]:
                      f.type === "number"
                        ? e.target.value === ""
                          ? null
                          : Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
      </div>
      {kind === "payment" && (
        <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
          This records a payment already made. It does not collect or transfer
          money. Ledger entries are retained; use a refund entry for returned
          funds.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button disabled={busy} className="button primary">
          {busy
            ? "Saving…"
            : kind === "payment"
              ? "Record payment"
              : "Save details"}
        </button>
      </div>
    </form>
  );
}
