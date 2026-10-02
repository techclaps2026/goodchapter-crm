import { describe, expect, it } from "vitest";
import { invoiceUpiUri } from "../lib/payment-qr";
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
});
