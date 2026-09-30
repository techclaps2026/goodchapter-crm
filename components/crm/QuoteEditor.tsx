"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  CommercialDocument,
  Snapshot,
  TaxMode,
  LineInput,
} from "@/lib/types";
import { blankLine, priceLines, money } from "@/lib/domain";
import type { Mutate } from "./use-crm";
import { Totals } from "./shared";
export default function QuoteEditor({
  s,
  doc,
  clientId,
  mutate,
  busy,
  onDone,
}: {
  s: Snapshot;
  doc?: CommercialDocument;
  clientId?: string;
  mutate: Mutate;
  busy: boolean;
  onDone: (id: string) => void;
}) {
  const [title, setTitle] = useState(doc?.title ?? "");
  const [client, setClient] = useState(doc?.client_id ?? clientId ?? "");
  const [lead, setLead] = useState(doc?.lead_id ?? "");
  const [valid, setValid] = useState(doc?.valid_until ?? "");
  const [mode, setMode] = useState<TaxMode>(doc?.tax_mode ?? "None");
  const [terms, setTerms] = useState(doc?.terms ?? s.settings.terms);
  const [items, setItems] = useState<LineInput[]>(doc?.items ?? [blankLine()]);
  const [error, setError] = useState("");
  const totals = priceLines(items, mode);
  const change = (i: number, key: keyof LineInput, value: string | number) =>
    setItems(items.map((l, j) => (j === i ? { ...l, [key]: value } : l)));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const result = await mutate("save_quote", {
            ...(doc ? { id: doc.id } : {}),
            title,
            client_id: client,
            lead_id: lead || null,
            valid_until: valid || null,
            tax_mode: mode,
            items,
            terms,
          });
          onDone(result.id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save quotation");
        }
      }}
    >
      <div className="field-grid">
        <label className="wide">
          Project / quotation title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New-joiner welcome kits"
          />
        </label>
        <label>
          Client
          <select
            required
            value={client}
            onChange={(e) => {
              setClient(e.target.value);
              setLead("");
            }}
          >
            <option value="">Choose a client</option>
            {s.clients
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.organisation || c.name} · {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Linked enquiry
          <select value={lead} onChange={(e) => setLead(e.target.value)}>
            <option value="">No linked enquiry</option>
            {s.leads
              .filter((l) => l.client_id === client)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.brief}
                </option>
              ))}
          </select>
        </label>
        <label>
          Valid until
          <input
            type="date"
            value={valid}
            onChange={(e) => setValid(e.target.value)}
          />
        </label>
        <label>
          Tax presentation
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as TaxMode)}
          >
            <option>None</option>
            <option>CGST/SGST</option>
            <option>IGST</option>
          </select>
        </label>
      </div>
      <div className="divider" />
      <div className="row between">
        <h3>Merchandise & services</h3>
        <select
          aria-label="Add product from catalogue"
          style={{ width: 230 }}
          value=""
          onChange={(e) => {
            const p = s.products.find((p) => p.id === e.target.value);
            if (p)
              setItems([
                ...items.filter((i) => i.description.trim()),
                {
                  ...blankLine(),
                  description: p.name,
                  details: [p.description, p.customisation]
                    .filter(Boolean)
                    .join(" · "),
                  unit_price: Number(p.unit_price),
                  category: p.category,
                },
              ]);
          }}
        >
          <option value="">Add from catalogue…</option>
          {s.products
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>
      {items.map((l, i) => (
        <div className="line-editor" key={i}>
          <div className="row between">
            <span className="eyebrow">
              ITEM {String(i + 1).padStart(2, "0")}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove item ${i + 1}`}
              disabled={items.length === 1}
              onClick={() => setItems(items.filter((_, j) => j !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <label>
            Description
            <input
              required
              value={l.description}
              onChange={(e) => change(i, "description", e.target.value)}
            />
          </label>
          <label style={{ marginTop: 12 }}>
            Sizes, colours & customisation
            <textarea
              value={l.details}
              onChange={(e) => change(i, "details", e.target.value)}
              placeholder="e.g. Sand · S: 20, M: 30, L: 25, XL: 5 · chest embroidery"
            />
          </label>
          <div className="numbers">
            {[
              ["quantity", "Quantity", 1],
              ["unit_price", "Unit price (INR)", 0.01],
              ["discount_pct", "Discount %", 0.01],
              ["tax_rate", "Tax rate %", 0.01],
            ].map(([key, label, step]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  required
                  min={key === "quantity" ? 1 : 0}
                  max={
                    String(key).includes("pct") || key === "tax_rate"
                      ? 100
                      : undefined
                  }
                  step={step}
                  disabled={key === "tax_rate" && mode === "None"}
                  value={
                    key === "tax_rate" && mode === "None"
                      ? 0
                      : l[key as keyof LineInput]
                  }
                  onChange={(e) =>
                    change(i, key as keyof LineInput, Number(e.target.value))
                  }
                />
              </label>
            ))}
          </div>
          <div className="row between" style={{ marginTop: 12 }}>
            <label>
              HSN / SAC
              <input
                value={l.hsn}
                onChange={(e) => change(i, "hsn", e.target.value)}
              />
            </label>
            <strong>{money(totals.items[i].total)}</strong>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="button"
        onClick={() => setItems([...items, blankLine()])}
      >
        <Plus size={15} />
        Custom item / charge
      </button>
      <Totals {...totals} tax_mode={mode} />
      <label style={{ marginTop: 24 }}>
        Terms & notes visible to the client
        <textarea value={terms} onChange={(e) => setTerms(e.target.value)} />
      </label>
      <p style={{ fontSize: 11, marginTop: 12 }}>
        Set tax rates supplied by your business. Catalogue changes won’t alter
        saved quotation items.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button disabled={busy} className="button primary">
          {busy ? "Saving…" : "Save quotation"}
        </button>
      </div>
    </form>
  );
}
