import { expect, it } from "vitest";
import { buildDocumentPdf } from "../lib/document-pdf";
import { priceLines, blankLine } from "../lib/domain";
import type { CommercialDocument } from "../lib/types";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
it("paginates merchandise documents and omits private record fields", async () => {
  const pricing = priceLines(
    Array.from({ length: 45 }, (_, i) => ({
      ...blankLine(),
      description: `Merchandise item ${i + 1}`,
      details:
        "Sand and charcoal. S: 20, M: 30, L: 30. Embroidered logo with individual name customisation.",
      quantity: 80,
      unit_price: 650,
      discount_pct: 10,
      tax_rate: 18,
      hsn: "TEST",
    })),
    "CGST/SGST",
  );
  const d = {
    id: "test",
    kind: "invoice",
    ref: "INV-QA-45",
    title: "Fictional corporate merchandise programme",
    status: "Issued",
    issued_on: "2026-09-30",
    due_on: "2026-10-15",
    tax_mode: "CGST/SGST",
    ...pricing,
    customer: {
      name: "QA Customer",
      organisation: "Fictional QA Ltd",
      email: "qa@example.test",
      billing_address: "Fictional studio, Bengaluru",
      gstin: "",
    },
    business: {
      company_name: "The Good Chapter",
      email: "hello@example.test",
      address: "Fictional studio address",
      phone: "",
      gstin: "",
      bank_details: "QA ONLY - no real account details",
    },
    terms:
      "Production starts after approval. Delivery dates are agreed in writing.",
    notes: "INTERNAL-DO-NOT-DISCLOSE",
    cost: 987654321,
  } as unknown as CommercialDocument;
  const pdf = await buildDocumentPdf(d);
  expect(pdf.getNumberOfPages()).toBeGreaterThan(2);
  const output = pdf.output();
  expect(output).toContain("Merchandise item 45");
  expect(output).toContain("PAYMENT DETAILS");
  expect(output).not.toContain("INTERNAL-DO-NOT-DISCLOSE");
  expect(output).not.toContain("987654321");
  if (process.env.PDF_QA_DIR) {
    await mkdir(process.env.PDF_QA_DIR, { recursive: true });
    await writeFile(
      join(process.env.PDF_QA_DIR, "multipage-invoice.pdf"),
      Buffer.from(pdf.output("arraybuffer")),
    );
  }
});
