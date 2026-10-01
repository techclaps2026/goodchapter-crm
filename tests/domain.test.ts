import { describe, it, expect } from "vitest";
import { priceLines, blankLine, orderMoney, paymentState } from "../lib/domain";
import { validateMutation, invitationSchema } from "../lib/validation";
import { canManageUsers, hasOwnerAccess, type Snapshot } from "../lib/types";
describe("quotation pricing", () => {
  it("prices quantities, discounts, charges and IGST separately", () => {
    const r = priceLines(
      [
        {
          ...blankLine(),
          description: "Shirts",
          quantity: 80,
          unit_price: 650,
          discount_pct: 10,
          tax_rate: 18,
        },
        {
          ...blankLine(),
          description: "Setup",
          quantity: 1,
          unit_price: 500,
          tax_rate: 18,
        },
      ],
      "IGST",
    );
    expect(r.subtotal).toBe(47300);
    expect(r.tax_amount).toBe(8514);
    expect(r.total).toBe(55814);
  });
  it("rounds each split GST component to paise", () => {
    const r = priceLines(
      [
        {
          ...blankLine(),
          description: "Sample",
          unit_price: 0.1,
          tax_rate: 10,
        },
      ],
      "CGST/SGST",
    );
    expect(r.tax_amount).toBe(0.02);
    expect(r.total).toBe(0.12);
  });
  it("does not inherit tax when tax mode is None", () => {
    expect(
      priceLines(
        [
          {
            ...blankLine(),
            description: "Bottle",
            unit_price: 99.99,
            tax_rate: 18,
          },
        ],
        "None",
      ).total,
    ).toBe(99.99);
  });
  it("rounds discount ties using integer paise", () => {
    expect(
      priceLines(
        [
          {
            ...blankLine(),
            description: "Sample",
            unit_price: 0.3,
            discount_pct: 15,
          },
        ],
        "None",
      ).subtotal,
    ).toBe(0.26);
  });
});
describe("input boundaries", () => {
  const key = crypto.randomUUID();
  it("rejects invalid quantities", () =>
    expect(() =>
      validateMutation({
        action: "save_quote",
        key,
        payload: {
          title: "Bad quote",
          client_id: key,
          lead_id: null,
          valid_until: null,
          tax_mode: "None",
          items: [{ ...blankLine(), description: "A", quantity: 0 }],
          terms: "",
        },
      }),
    ).toThrow());
  it("strips untrusted calculated totals and extra input", () => {
    const r = validateMutation({
      action: "log_payment",
      key,
      payload: {
        order_id: key,
        amount: 100,
        kind: "Receipt",
        method: "Cash",
        payment_date: "2026-09-29",
        reference: "",
        notes: "",
        created_by: "attacker",
      },
    });
    expect(r.payload).not.toHaveProperty("created_by");
  });
  it("rejects arbitrary image URL schemes", () =>
    expect(() =>
      validateMutation({
        action: "save_product",
        key,
        payload: {
          name: "Test",
          category: "Other",
          description: "",
          customisation: "",
          unit_price: 1,
          image_url: "javascript:alert(1)",
        },
      }),
    ).toThrow());
});
it("accepts only defined invitation roles", () => {
  for (const role of ["staff", "admin", "co_owner", "owner"])
    expect(
      invitationSchema.parse({
        email: "teammate@example.test",
        full_name: "Teammate",
        role,
      }).role,
    ).toBe(role);
  expect(() =>
    invitationSchema.parse({
      email: "teammate@example.test",
      full_name: "Teammate",
      role: "superuser",
    }),
  ).toThrow();
});
it("reserves user management for Owner and Admin", () => {
  expect(canManageUsers("owner")).toBe(true);
  expect(canManageUsers("admin")).toBe(true);
  expect(canManageUsers("co_owner")).toBe(false);
  expect(canManageUsers("staff")).toBe(false);
  expect(hasOwnerAccess("co_owner")).toBe(true);
});
it("derives balances from ledger entries, including refunds and overpayments", () => {
  const s = {
    orders: [{ id: "o", quote_id: "q" }],
    documents: [{ id: "q", total: 100 }],
    payments: [
      { order_id: "o", amount: 120, kind: "Receipt" },
      { order_id: "o", amount: 10, kind: "Refund" },
    ],
  } as unknown as Snapshot;
  expect(orderMoney(s, "o")).toEqual({ total: 100, paid: 110, balance: -10 });
});
it("derives invoice payment state from receipts and the current invoice", () => {
  const s = {
    orders: [{ id: "o", quote_id: "q" }],
    documents: [
      { id: "q", total: 100 },
      { id: "old", kind: "invoice", order_id: "o", status: "Superseded", total: 120 },
      { id: "current", kind: "invoice", order_id: "o", status: "Issued", total: 150 },
    ],
    payments: [{ order_id: "o", amount: 60, kind: "Receipt" }],
  } as unknown as Snapshot;
  expect(orderMoney(s, "o")).toEqual({ total: 150, paid: 60, balance: 90 });
  expect(paymentState(150, 0)).toBe("Unpaid");
  expect(paymentState(150, 60)).toBe("Partially paid");
  expect(paymentState(150, 150)).toBe("Fully paid");
  expect(paymentState(150, 170)).toBe("Fully paid");
});

import { documentEmail } from "../lib/document-email";
import type { CommercialDocument } from "../lib/types";
it("escapes customer text in email and includes no private fields", () => {
  const d = {
    kind: "quote",
    ref: "Q-TEST",
    title: "<img src=x>",
    total: 100,
    customer: { name: "A & B" },
    business: { email: "hello@example.test" },
    notes: "INTERNAL SECRET",
    cost: 12345,
  } as unknown as CommercialDocument;
  const out = documentEmail(d, "https://example.test/share/token");
  expect(out.html).toContain("&lt;img src=x&gt;");
  expect(out.html).not.toContain("INTERNAL SECRET");
  expect(out.html).not.toContain("12345");
  expect(out.text).toContain("https://example.test/share/token");
});
