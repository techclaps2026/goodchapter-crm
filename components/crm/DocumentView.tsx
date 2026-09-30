/* eslint-disable @next/next/no-img-element -- Original SVG brand and user-provided catalogue URLs. */
"use client";
import type { CommercialDocument } from "@/lib/types";
import { dateLabel, money } from "@/lib/domain";
import { Totals } from "./shared";
export default function DocumentView({ doc: d }: { doc: CommercialDocument }) {
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
            {d.kind === "quote" ? "QUOTATION" : "INVOICE"}
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
            Currency: INR · Tax: {d.tax_mode}
          </p>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
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
                  <strong>{i.description}</strong>
                  <small style={{ whiteSpace: "pre-wrap" }}>{i.details}</small>
                  {i.hsn && <small>HSN/SAC {i.hsn}</small>}
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
      <Totals {...d} />
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
    </article>
  );
}
