import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Payment, Snapshot } from "./types";
import { dateLabel } from "./domain";
import { drawDocumentFooter, drawDocumentHeader } from "./document-pdf-brand";

const amountLabel = (amount: number) =>
  `INR ${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function paymentReceiptRef(payment: Payment) {
  const prefix = payment.kind === "Refund" ? "RFND" : "RCPT";
  return `${prefix}-${payment.payment_date.replaceAll("-", "")}-${payment.id.slice(0, 8).toUpperCase()}`;
}

export async function createPaymentReceiptPdf(
  snapshot: Snapshot,
  payment: Payment,
  logoDataUrl?: string,
) {
  const order = snapshot.orders.find((item) => item.id === payment.order_id);
  if (!order) throw new Error("The payment's order is unavailable");
  const invoice = snapshot.documents.find(
    (item) => item.kind === "invoice" && item.order_id === order.id && item.status === "Issued",
  );
  const client = invoice?.customer ?? snapshot.clients.find((item) => item.id === order.client_id);
  if (!client) throw new Error("The payment's client is unavailable");
  const business = {
    company_name: snapshot.settings.company_name || invoice?.business.company_name || "The Good Chapter",
    address: snapshot.settings.address || invoice?.business.address || "",
    email: snapshot.settings.email || invoice?.business.email || "",
    phone: snapshot.settings.phone || invoice?.business.phone || "",
    gstin: snapshot.settings.gstin || invoice?.business.gstin || "",
  };
  const receiptRef = paymentReceiptRef(payment);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 17;
  const right = 193;
  const ink = [24, 23, 21] as const;
  const muted = [105, 98, 90] as const;
  const wrap = (value: string, width: number) => pdf.splitTextToSize(value, width) as string[];
  const writeLines = (lines: string[], x: number, y: number, step = 4.5) => {
    if (lines.length) pdf.text(lines, x, y);
    return y + lines.length * step;
  };

  await drawDocumentHeader(
    pdf,
    business.company_name,
    payment.kind === "Refund" ? "REFUND ACKNOWLEDGEMENT" : "PAYMENT RECEIPT",
    receiptRef,
    logoDataUrl,
  );

  let y = 51;
  pdf.setTextColor(...muted);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text(payment.kind === "Refund" ? "REFUNDED TO" : "RECEIVED FROM", margin, y);
  pdf.text("ISSUED BY", 108, y);
  y += 7;

  pdf.setTextColor(...ink);
  pdf.setFontSize(11);
  const clientName = client.organisation || client.name;
  const clientNameLines = wrap(clientName, 80);
  const businessNameLines = wrap(business.company_name || "The Good Chapter", 85);
  const clientNameEnd = writeLines(clientNameLines, margin, y, 5);
  const businessNameEnd = writeLines(businessNameLines, 108, y, 5);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...muted);
  const clientLines = [client.organisation && client.name, client.billing_address, client.email]
    .filter(Boolean)
    .flatMap((line) => wrap(String(line), 80));
  const businessLines = [business.address, business.email, business.phone, business.gstin && `GSTIN: ${business.gstin}`]
    .filter(Boolean)
    .flatMap((line) => wrap(String(line), 85));
  const clientEnd = writeLines(clientLines, margin, clientNameEnd + 1);
  const businessEnd = writeLines(businessLines, 108, businessNameEnd + 1);
  y = Math.max(clientEnd, businessEnd) + 8;

  pdf.setDrawColor(222, 216, 204);
  pdf.setLineWidth(0.2);
  pdf.line(margin, y, right, y);
  y += 12;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...muted);
  pdf.text(payment.kind === "Refund" ? "REFUND RECORDED" : "PAYMENT RECEIVED", margin, y);
  pdf.setFontSize(22);
  pdf.setTextColor(...ink);
  pdf.text(amountLabel(payment.amount), margin, y + 13);
  y += 24;

  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["PAYMENT DATE", "METHOD", "TRANSACTION REFERENCE"]],
    body: [[dateLabel(payment.payment_date), payment.method, payment.reference || "Not provided"]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 4,
      overflow: "linebreak",
      lineColor: [222, 216, 204],
      lineWidth: 0.1,
      textColor: [30, 28, 25],
    },
    headStyles: {
      fillColor: [12, 11, 10],
      textColor: [255, 255, 255],
      fontStyle: "normal",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 51 },
      1: { cellWidth: 43 },
      2: { cellWidth: 82 },
    },
  });
  const table = pdf as jsPDF & { lastAutoTable: { finalY: number } };
  y = table.lastAutoTable.finalY + 13;
  if (y > 245) {
    pdf.addPage();
    y = 24;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...muted);
  pdf.text("APPLIED TO ORDER", margin, y);
  pdf.text(invoice ? "RELATED INVOICE" : "PAYMENT TYPE", 108, y);
  y += 7;
  pdf.setTextColor(...ink);
  pdf.setFontSize(11);
  const orderRefEnd = writeLines(wrap(order.ref, 80), margin, y, 5);
  writeLines(wrap(invoice?.ref || "Advance against order", 85), 108, y, 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...muted);
  const titleEnd = writeLines(wrap(order.title, 80), margin, orderRefEnd + 1);
  y = Math.max(titleEnd, y + 12) + 8;

  pdf.setDrawColor(222, 216, 204);
  pdf.line(margin, y, right, y);
  y += 9;
  pdf.setFontSize(8.5);
  const note = payment.kind === "Refund"
    ? "This acknowledges a refund recorded against the order above. Please retain the original invoice and any applicable credit note for tax details."
    : "This acknowledges a payment recorded against the order above. Please retain the invoice for tax details; this receipt does not replace a tax invoice.";
  y = writeLines(wrap(note, 176), margin, y) + 5;
  pdf.setFontSize(7.5);
  pdf.text(`Payment ID: ${payment.id}`, margin, y);

  drawDocumentFooter(pdf, business.company_name || "The Good Chapter", receiptRef);
  return { pdf, filename: `${receiptRef}.pdf` };
}
