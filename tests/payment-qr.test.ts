import { describe, expect, it } from "vitest";
import { invoicePaymentQrImageUrl, invoiceUpiUri } from "../lib/payment-qr";
import type { CommercialDocument } from "../lib/types";

const invoice = {
  kind: "invoice",
  ref: "INV-2026-0001",
  payment_qr_enabled: true,
  business: { company_name: "The Good Chapter", upi_id: "chapter@okbizaxis" },
} as CommercialDocument;

describe("invoice UPI QR", () => {
  it("includes the payee and invoice reference without a stale amount", () => {
    const uri = invoiceUpiUri(invoice);
    expect(uri).toMatch(/^upi:\/\/pay\?/);
    const params = new URL(uri!).searchParams;
    expect(params.get("pa")).toBe("chapter@okbizaxis");
    expect(params.get("tn")).toBe("Invoice INV-2026-0001");
    expect(params.has("am")).toBe(false);
  });
  it("does not create a QR when disabled", () => {
    expect(invoiceUpiUri({ ...invoice, payment_qr_enabled: false })).toBeNull();
  });
  it("shows an uploaded QR even without a UPI ID", () => {
    const path = "a9f0d345-e146-4124-8a28-324381b684cf.png";
    const uploaded = { ...invoice, business: { ...invoice.business,
      upi_id: "", payment_qr_path: path } } as CommercialDocument;
    expect(invoicePaymentQrImageUrl(uploaded)).toBe(`/api/payment-qr?path=${path}`);
    expect(invoiceUpiUri(uploaded)).toBeNull();
    expect(invoicePaymentQrImageUrl({ ...uploaded, payment_qr_enabled: false })).toBeNull();
  });
});
