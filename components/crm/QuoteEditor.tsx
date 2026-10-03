/* eslint-disable @next/next/no-img-element -- Uploaded quotation photos are served through an authenticated route. */
"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  CommercialDocument,
  Snapshot,
  TaxMode,
  QuotePricingMode,
  LineInput,
  QuoteOptionGroup,
} from "@/lib/types";
import { blankLine, priceLines, money } from "@/lib/domain";
import { quoteImageUrl } from "@/lib/quote-images";
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
  const [valid, setValid] = useState(
    doc?.kind === "invoice" ? doc.due_on || "" : doc?.valid_until || "",
  );
  const [mode, setMode] = useState<TaxMode>(doc?.tax_mode ?? "None");
  const [pricingMode, setPricingMode] = useState<QuotePricingMode>(doc?.pricing_mode ?? "priced");
  const [clientChoiceEnabled, setClientChoiceEnabled] = useState(doc?.client_choice_enabled ?? false);
  const [terms, setTerms] = useState(doc?.terms ?? s.settings.terms);
  const [items, setItems] = useState<LineInput[]>(doc?.pricing_mode === "selection" ? [blankLine()] : doc?.items ?? [blankLine()]);
  const [optionGroups, setOptionGroups] = useState<QuoteOptionGroup[]>(doc?.quote_options ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const isInvoice = doc?.kind === "invoice";
  const totals = priceLines(items, mode);
  const change = (i: number, key: keyof LineInput, value: string | number | null) =>
    setItems((current) => current.map((l, j) => (j === i ? { ...l, [key]: value } : l)));
  const uploadPhoto = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/quote-image", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not upload photo");
      return result.path as string;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload photo");
      return null;
    } finally {
      setUploading(false);
    }
  };
  const updateOption = (groupId: string, optionId: string, values: Record<string, string | number>) =>
    setOptionGroups((current) => current.map((group) => group.id === groupId
      ? { ...group, options: group.options.map((option) => option.id === optionId ? { ...option, ...values } : option) }
      : group));
  return (
    <form
      className="quote-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const result = isInvoice
            ? await mutate("save_invoice", {
                id: doc.id,
                title,
                due_on: valid || null,
                tax_mode: mode,
                items,
                terms,
              })
            : await mutate("save_quote", {
                ...(doc ? { id: doc.id } : {}),
                title,
                client_id: client,
                lead_id: lead || null,
                valid_until: valid || null,
                tax_mode: pricingMode === "selection" ? "None" : mode,
                pricing_mode: pricingMode,
                client_choice_enabled: clientChoiceEnabled,
                items: pricingMode === "selection" ? [] : items,
                quote_options: pricingMode === "selection"
                  ? optionGroups.map((group) => ({ ...group, options: group.options.map((option) => ({ ...option, unit_price: 0 })) }))
                  : optionGroups,
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
          {isInvoice ? "Invoice title" : "Project / quotation title"}
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New-joiner welcome kits"
          />
        </label>
        {!isInvoice && <fieldset className="wide quote-pricing-mode">
          <legend>Quotation type</legend>
          <label><input type="radio" name="pricing-mode" checked={pricingMode === "priced"}
            onChange={() => setPricingMode("priced")} /> Priced quotation <small>Show item prices and a total</small></label>
          <label><input type="radio" name="pricing-mode" checked={pricingMode === "selection"}
            onChange={() => {
              setPricingMode("selection");
              if (optionGroups.length === 0) setOptionGroups([{ id: crypto.randomUUID(), title: "", quantity: 1,
                options: [{ id: crypto.randomUUID(), title: "", details: "", image_path: "", unit_price: 0 }] }]);
            }} /> Selection proposal <small>Present ideas first; send prices later</small></label>
        </fieldset>}
        {!isInvoice && optionGroups.length > 0 && <label className="wide quote-choice-toggle">
          <input type="checkbox" checked={clientChoiceEnabled}
            onChange={(e) => setClientChoiceEnabled(e.target.checked)} />
          <span>Allow client to choose options on the shared quotation
            <small>Off by default. Leave it off for inspiration-only proposals.</small>
          </span>
        </label>}
        {isInvoice ? (
          <label>
            Client
            <input
              value={doc.customer.organisation || doc.customer.name}
              readOnly
            />
          </label>
        ) : (
          <>
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
          </>
        )}
        <label>
          {isInvoice ? "Payment due date" : "Valid until"}
          <input
            type="date"
            value={valid}
            onChange={(e) => setValid(e.target.value)}
          />
        </label>
        {(isInvoice || pricingMode === "priced") && <label>
          Tax presentation
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as TaxMode)}
          >
            <option>None</option>
            <option>CGST/SGST</option>
            <option>IGST</option>
          </select>
        </label>}
      </div>
      <div className="divider" />
      {(isInvoice || pricingMode === "priced") && <>
      <div className="row between">
        <h3>Items & services</h3>
        <select
          aria-label="Add item from catalogue"
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
            Specifications & customisation (optional)
            <textarea
              value={l.details}
              onChange={(e) => change(i, "details", e.target.value)}
              placeholder="e.g. Material, size, colour, finish, packaging or branding requirements"
            />
          </label>
          {!isInvoice && <div className="field-grid quote-item-extra">
            <label>Minimum order quantity (optional)
              <input type="number" min={1} step={1} value={l.moq ?? ""} placeholder="e.g. 100"
                onChange={(e) => change(i, "moq", e.target.value ? Number(e.target.value) : null)} />
            </label>
            <label>Item notes (optional)
              <textarea value={l.notes ?? ""} placeholder="Lead time, packaging or other details for this item"
                onChange={(e) => change(i, "notes", e.target.value)} />
            </label>
          </div>}
          <div className="quote-photo-input">
            {l.image_path && <img src={quoteImageUrl(l.image_path)} alt={l.description || `Item ${i + 1}`} />}
            <label>
              Item photo (optional)
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const path = await uploadPhoto(file);
                  if (path) change(i, "image_path", path);
                  event.target.value = "";
                }} />
            </label>
            {l.image_path && <button type="button" className="text-link" onClick={() => change(i, "image_path", "")}>Remove photo</button>}
          </div>
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
                      : (l[key as keyof LineInput] ?? "")
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
      </>}
      {!isInvoice && (
        <section className="quote-options-editor">
          <div className="row between">
            <div>
              <h3>{pricingMode === "selection" ? "Choices for the client" : "Client comparison options"}</h3>
              <p>{pricingMode === "selection"
                ? "Add one or more groups of alternatives. The client can choose one item from each group. No prices or totals will appear in this proposal."
                : "Group alternatives such as diya, magnet and keychain. Their prices are shown for review; the quotation total includes only the priced items above."}</p>
            </div>
            <button type="button" className="button" disabled={optionGroups.length >= 20}
              onClick={() => setOptionGroups([...optionGroups, {
                id: crypto.randomUUID(), title: "", quantity: 1,
                options: [{ id: crypto.randomUUID(), title: "", details: "", image_path: "", unit_price: 0 }],
              }])}>
              <Plus size={15} /> Add option group
            </button>
          </div>
          {optionGroups.map((group, groupIndex) => (
            <div className="quote-option-group-editor" key={group.id}>
              <div className="row between">
                <strong>Group {groupIndex + 1}</strong>
                <button type="button" className="icon-button" aria-label={`Remove group ${groupIndex + 1}`}
                  onClick={() => setOptionGroups(optionGroups.filter((entry) => entry.id !== group.id))}><Trash2 size={15} /></button>
              </div>
              <div className="field-grid">
                <label>Choice category
                  <input required value={group.title} placeholder="e.g. Diwali hamper add-on"
                    onChange={(event) => setOptionGroups(optionGroups.map((entry) => entry.id === group.id ? { ...entry, title: event.target.value } : entry))} />
                </label>
                <label>Quantity per option
                  <input required type="number" min={1} max={1000000} value={group.quantity}
                    onChange={(event) => setOptionGroups(optionGroups.map((entry) => entry.id === group.id ? { ...entry, quantity: Number(event.target.value) } : entry))} />
                </label>
              </div>
              <div className="quote-option-grid">
                {group.options.map((option, optionIndex) => (
                  <div className="quote-option-editor" key={option.id}>
                    <div className="row between"><span className="eyebrow">OPTION {optionIndex + 1}</span>
                      <button type="button" className="icon-button" aria-label={`Remove option ${optionIndex + 1}`}
                        disabled={group.options.length === 1}
                        onClick={() => setOptionGroups(optionGroups.map((entry) => entry.id === group.id ? { ...entry, options: entry.options.filter((item) => item.id !== option.id) } : entry))}><Trash2 size={15} /></button>
                    </div>
                    {option.image_path && <img className="quote-option-thumb" src={quoteImageUrl(option.image_path)} alt={option.title || `Option ${optionIndex + 1}`} />}
                    <label>Photo
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const path = await uploadPhoto(file);
                          if (path) updateOption(group.id, option.id, { image_path: path });
                          event.target.value = "";
                        }} />
                    </label>
                    <label>Option name
                      <input required value={option.title} placeholder="e.g. Hand-painted diya"
                        onChange={(event) => updateOption(group.id, option.id, { title: event.target.value })} />
                    </label>
                    <label>Details
                      <textarea value={option.details} onChange={(event) => updateOption(group.id, option.id, { details: event.target.value })} />
                    </label>
                    {pricingMode === "priced" && <label>Unit price (INR)
                      <input required type="number" min={0} step="0.01" value={option.unit_price}
                        onChange={(event) => updateOption(group.id, option.id, { unit_price: Number(event.target.value) })} />
                    </label>}
                  </div>
                ))}
              </div>
              <button type="button" className="button small" disabled={group.options.length >= 8}
                onClick={() => setOptionGroups(optionGroups.map((entry) => entry.id === group.id ? {
                  ...entry, options: [...entry.options, { id: crypto.randomUUID(), title: "", details: "", image_path: "", unit_price: 0 }],
                } : entry))}><Plus size={14} /> Add another option</button>
            </div>
          ))}
        </section>
      )}
      {(isInvoice || pricingMode === "priced") && <Totals {...totals} tax_mode={mode} />}
      <label style={{ marginTop: 24 }}>
        Terms & notes visible to the client
        <textarea value={terms} onChange={(e) => setTerms(e.target.value)} />
      </label>
      <p style={{ fontSize: 11, marginTop: 12 }}>
        Set tax rates supplied by your business. Catalogue changes won’t alter
        saved {isInvoice ? "invoice" : "quotation"} items.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!isInvoice && <p className="quote-save-hint">Save the {pricingMode === "selection" ? "selection proposal" : "quotation"} to preview it and download a PDF.</p>}
      <div className="form-footer">
        <button disabled={busy || uploading} className="button primary">
          {busy
            ? "Saving…"
            : uploading
              ? "Uploading image…"
            : isInvoice
              ? "Save invoice draft"
              : pricingMode === "selection" ? "Save selection proposal" : "Save quotation"}
        </button>
      </div>
    </form>
  );
}
