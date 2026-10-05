import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { createPaymentReceiptPdf } from "../lib/payment-receipt";
import type { Payment, Snapshot } from "../lib/types";

const payment: Payment = {
  id: "e58db678-9d25-44cf-aeb3-3bd8843cbbd2",
  order_id: "order-1",
  amount: 24579.45,
  kind: "Receipt",
  method: "UPI",
  payment_date: "2026-10-04",
  reference: "627723109009",
  notes: "Internal note should stay private",
};

const snapshot = {
  settings: {
    company_name: "The Good Chapter",
    address: "Studio 12, Central Avenue, New Delhi, Delhi 110001",
    email: "hello@example.test",
    phone: "+91 90000 00000",
    gstin: "03BCEPP1548K1ZL",
  },
  orders: [{ id: "order-1", ref: "O-2026-0041", title: "Corporate welcome kits", client_id: "client-1" }],
  clients: [{ id: "client-1", name: "Meera Shah", organisation: "Northstar Studio", billing_address: "Building 4, Example Road, Gurugram, Haryana 122001", email: "meera@example.test" }],
  documents: [],
} as unknown as Snapshot;

describe("payment receipt PDF", () => {
  it("contains the payment, order and client without exposing internal notes", () => {
    const { pdf, filename } = createPaymentReceiptPdf(snapshot, payment);
    const output = pdf.output();
    expect(filename).toBe("RCPT-20261004-E58DB678.pdf");
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(output).toContain("PAYMENT RECEIPT");
    expect(output).toContain("O-2026-0041");
    expect(output).toContain("Northstar Studio");
    expect(output).not.toContain(payment.notes);
    if (process.env.RECEIPT_QA_OUTPUT) {
      writeFileSync(process.env.RECEIPT_QA_OUTPUT, Buffer.from(pdf.output("arraybuffer")));
    }
  });

  it("labels a refund as a refund acknowledgement", () => {
    const { pdf, filename } = createPaymentReceiptPdf(snapshot, {
      ...payment,
      id: "f67bc678-9d25-44cf-aeb3-3bd8843cbbd2",
      kind: "Refund",
    });
    expect(filename).toBe("RFND-20261004-F67BC678.pdf");
    expect(pdf.output()).toContain("REFUND ACKNOWLEDGEMENT");
    expect(pdf.output()).toContain("REFUNDED TO");
  });
});
