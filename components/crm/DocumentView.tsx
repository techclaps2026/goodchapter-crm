/* eslint-disable @next/next/no-img-element -- Original SVG brand and user-provided catalogue URLs. */
"use client";
import type { CommercialDocument } from "@/lib/types";
import { dateLabel, money } from "@/lib/domain";
import { Totals } from "./shared";
import PaymentQr from "./PaymentQr";
import { quoteImageUrl } from "@/lib/quote-images";
export default function DocumentView({
  doc: d,
  shareToken,
  selections,
  onSelect,
}: {
  doc: CommercialDocument;
  shareToken?: string;
  selections?: Record<string, string>;
  onSelect?: (groupId: string, optionId: string) => void;
}) {
  const selection = d.kind === "quote" && d.pricing_mode === "selection";
  return (
    <article className="document">
      <header>
        <div>
          <img src="/logo-dark.svg" alt="The Good Chapter" />
          <p style={{ marginTop: 14 }}>
            {d.business.address}
            <br />
            {d.business.email}
            {d.business.phone && (
              <>
                <br />
                {d.business.phone}
              </>
            )}
            {d.business.gstin && (
              <>
                <br />
                GSTIN: {d.business.gstin}
              </>
            )}
          </p>
        </div>
        <div className="document-meta">
          <div className="eyebrow">
            {selection ? "SELECTION PROPOSAL" : d.kind === "quote" ? "QUOTATION" : "INVOICE"}
          </div>
          <h2 style={{ marginTop: 9 }}>{d.ref}</h2>
          <p>{d.status}</p>
        </div>
      </header>
      <h2>{d.title}</h2>
      <div className="doc-columns">
        <div>
          <div className="eyebrow">PREPARED FOR</div>
          <h3 style={{ marginTop: 8 }}>
            {d.customer.organisation || d.customer.name}
          </h3>
          <p>
            {d.customer.name}
            <br />
            {d.customer.billing_address}
            <br />
            {d.customer.email}
            {d.customer.gstin && (
              <>
                <br />
                GSTIN: {d.customer.gstin}
              </>
            )}
          </p>
        </div>
        <div>
          <div className="eyebrow">DETAILS</div>
          <p style={{ marginTop: 8 }}>
            {d.kind === "quote"
              ? `Valid until: ${dateLabel(d.valid_until)}`
              : `Issued: ${dateLabel(d.issued_on)}\nDue: ${dateLabel(d.due_on)}`}
            <br />
            {selection ? "Pricing will follow your selections" : <>Currency: INR · Tax: {d.tax_mode}</>}
          </p>
        </div>
      </div>
      {d.kind === "quote" && (d.quote_options?.length ?? 0) > 0 && (
        <section className="quote-options-view">
          <div className="eyebrow">EXPLORE YOUR OPTIONS</div>
          <h3>Choose the details that make it yours</h3>
          <p>{selection
            ? "Choose one item from each group. We’ll prepare a priced quotation after reviewing your selections."
            : "Option prices are shown for comparison. The quotation total below reflects the priced items; choices will be confirmed in a revised quotation."}</p>
          {d.quote_options?.map((group) => (
            <div className="quote-options-group" key={group.id}>
              <div className="row between">
                <h4>{group.title}</h4>
                <span>{group.quantity} per option</span>
              </div>
              <div className="quote-option-grid">
                {group.options.map((option) => {
                  const selected = (selections ?? d.quote_selections)?.[group.id] === option.id;
                  return (
                    <label className={`quote-option-card${selected ? " selected" : ""}`} key={option.id}>
                      {option.image_path ? (
                        <img src={quoteImageUrl(option.image_path, shareToken)} alt={option.title} />
                      ) : <div className="quote-option-placeholder">Product photo pending</div>}
                      <span className="quote-option-copy">
                        <strong>{option.title}</strong>
                        {option.details && <small>{option.details}</small>}
                        {!selection && <><b>{money(option.unit_price)} / unit</b>
                        <small>{group.quantity} × {money(option.unit_price)} = {money(group.quantity * Number(option.unit_price))}</small></>}
                        {onSelect ? (
                          <span className="quote-choice"><input type="radio" name={`option-${group.id}`}
                            checked={selected} onChange={() => onSelect(group.id, option.id)} /> Choose this option</span>
                        ) : selected ? <span className="quote-choice">Client selected</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}
      {!selection && <><div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Disc.</th>
              <th>Tax</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((i, n) => (
              <tr key={n}>
                <td>
                  {i.image_path && <img className="document-item-photo" src={quoteImageUrl(i.image_path, shareToken)} alt={i.description} />}
                  <strong>{i.description}</strong>
                  <small style={{ whiteSpace: "pre-wrap" }}>{i.details}</small>
                  {i.hsn && <small>HSN/SAC {i.hsn}</small>}
                  {i.moq && <small>MOQ: {i.moq} units</small>}
                  {i.notes && <small>Note: {i.notes}</small>}
                </td>
                <td>{i.quantity}</td>
                <td>{money(i.unit_price)}</td>
                <td>{i.discount_pct}%</td>
                <td>{i.tax_rate}%</td>
                <td>{money(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Totals {...d} /></>}
      <div className="divider" />
      <div className="eyebrow">TERMS</div>
      <p style={{ marginTop: 9 }}>{d.terms}</p>
      {d.kind === "invoice" && d.business.bank_details && (
        <>
          <div className="divider" />
          <div className="eyebrow">PAYMENT DETAILS</div>
          <p style={{ marginTop: 9 }}>{d.business.bank_details}</p>
        </>
      )}
      {d.kind === "invoice" && d.payment_qr_enabled && <PaymentQr doc={d} />}
    </article>
  );
}
