import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CommercialDocument } from "./types";
import { dateLabel } from "./domain";
const value = (n: number) =>
  "INR " +
  Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export async function buildDocumentPdf(d: CommercialDocument) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = 210;
  const margin = 17;
  pdf.setFont("helvetica");
  pdf.setTextColor(20, 19, 17);
  try {
    const img = new Image();
    img.src = "/logo-dark.svg";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 935;
    c.height = 232;
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    pdf.addImage(c.toDataURL("image/png"), "PNG", margin, 16, 70, 17.4);
  } catch {
    pdf.setFontSize(18);
    pdf.text(d.business.company_name, margin, 25);
  }
  pdf.setFontSize(10);
  pdf.text(d.kind === "quote" ? "QUOTATION" : "INVOICE", width - margin, 21, {
    align: "right",
  });
  pdf.setFontSize(12);
  pdf.text(d.ref, width - margin, 29, { align: "right" });
  pdf.setFontSize(9);
  pdf.text(d.status, width - margin, 35, { align: "right" });
  pdf.setDrawColor(40, 38, 34);
  pdf.line(margin, 40, width - margin, 40);
  let y = 48;
  pdf.setFontSize(9);
  const textBlock = (
    text: string,
    x: number,
    start: number,
    maxWidth: number,
  ) => {
    const lines = pdf.splitTextToSize(text, maxWidth);
    pdf.text(lines, x, start);
    return start + lines.length * Math.max(4.3, pdf.getFontSize() * 0.45);
  };
  const right = textBlock(
    [
      d.business.company_name,
      d.business.address,
      d.business.email,
      d.business.phone,
      d.business.gstin ? "GSTIN: " + d.business.gstin : "",
    ]
      .filter(Boolean)
      .join("\n"),
    115,
    y,
    78,
  );
  pdf.setFont("helvetica", "bold");
  pdf.text("PREPARED FOR", margin, y);
  pdf.setFont("helvetica", "normal");
  const left = textBlock(
    [
      d.customer.organisation,
      d.customer.name,
      d.customer.billing_address,
      d.customer.email,
      d.customer.gstin ? "GSTIN: " + d.customer.gstin : "",
    ]
      .filter(Boolean)
      .join("\n"),
    margin,
    y + 7,
    90,
  );
  y = Math.max(left, right) + 9;
  pdf.setFontSize(15);
  y = textBlock(d.title, margin, y, 176) + 3;
  pdf.setFontSize(9);
  pdf.text(
    d.kind === "quote"
      ? `Valid until: ${dateLabel(d.valid_until)}`
      : `Issued: ${dateLabel(d.issued_on)}    Due: ${dateLabel(d.due_on)}`,
    margin,
    y,
  );
  y += 7;
  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin, top: 20, bottom: 20 },
    head: [
      ["Description / HSN", "Qty", "Unit (INR)", "Disc.", "Tax", "Total (INR)"],
    ],
    body: d.items.map((i) => [
      [i.description, i.details, i.hsn ? "HSN/SAC: " + i.hsn : ""]
        .filter(Boolean)
        .join("\n"),
      i.quantity,
      Number(i.unit_price).toFixed(2),
      `${i.discount_pct}%`,
      `${i.tax_rate}%`,
      Number(i.total).toFixed(2),
    ]),
    styles: {
      fontSize: 8.5,
      cellPadding: 3.5,
      overflow: "linebreak",
      lineColor: [222, 216, 204],
      lineWidth: 0.1,
      textColor: [30, 28, 25],
    },
    headStyles: {
      fillColor: [12, 11, 10],
      textColor: [255, 255, 255],
      fontStyle: "normal",
    },
    columnStyles: {
      0: { cellWidth: 72 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    rowPageBreak: "avoid",
  });
  const pos = pdf as jsPDF & { lastAutoTable: { finalY: number } };
  y = pos.lastAutoTable.finalY + 8;
  const rows = [
    ["Subtotal", value(d.subtotal)],
    ...(d.tax_mode === "CGST/SGST"
      ? [
          ["CGST", value(d.tax_amount / 2)],
          ["SGST", value(d.tax_amount / 2)],
        ]
      : [[d.tax_mode === "IGST" ? "IGST" : "Tax", value(d.tax_amount)]]),
    ["TOTAL", value(d.total)],
  ];
  if (y + rows.length * 7 > 270) {
    pdf.addPage();
    y = 25;
  }
  pdf.setFontSize(10);
  for (const [label, n] of rows) {
    pdf.text(label, 120, y);
    pdf.text(n, 193, y, { align: "right" });
    y += 7;
  }
  const appendBlock = (heading: string, body: string) => {
    if (!body) return;
    const lines = pdf.splitTextToSize(body, 176) as string[];
    if (y + 14 > 270) {
      pdf.addPage();
      y = 25;
    }
    y += 7;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.text(heading, margin, y);
    pdf.setFont("helvetica", "normal");
    y += 6;
    for (const line of lines) {
      if (y > 270) {
        pdf.addPage();
        y = 25;
      }
      pdf.text(line, margin, y);
      y += 4.5;
    }
  };
  appendBlock("TERMS", d.terms);
  if (d.kind === "invoice")
    appendBlock("PAYMENT DETAILS", d.business.bank_details);
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setTextColor(110, 103, 94);
    pdf.setFontSize(8);
    pdf.text(`${d.business.company_name} | ${d.ref}`, margin, 285);
    pdf.text(`${page} / ${pdf.getNumberOfPages()}`, 193, 285, {
      align: "right",
    });
  }
  return pdf;
}
export async function downloadDocument(d: CommercialDocument) {
  const pdf = await buildDocumentPdf(d);
  pdf.save(d.ref + ".pdf");
}
