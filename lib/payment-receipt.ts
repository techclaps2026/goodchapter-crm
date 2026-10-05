import { jsPDF } from "jspdf";
import type { Payment, Snapshot } from "./types";
import { dateLabel } from "./domain";

const amountLabel = (amount: number) =>
  `INR ${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function paymentReceiptRef(payment: Payment) {
  const prefix = payment.kind === "Refund" ? "RFND" : "RCPT";
  return `${prefix}-${payment.payment_date.replaceAll("-", "")}-${payment.id.slice(0, 8).toUpperCase()}`;
}

export function createPaymentReceiptPdf(snapshot: Snapshot, payment: Payment) {
  const order = snapshot.orders.find((item) => item.id === payment.order_id);
  if (!order) throw new Error("The payment's order is unavailable");
  const invoice = snapshot.documents.find(
    (item) =>
      item.kind === "invoice" &&
      item.order_id === order.id &&
      item.status === "Issued",
  );
  const client = invoice?.customer ?? snapshot.clients.find((item) => item.id === order.client_id);
  if (!client) throw new Error("The payment's client is unavailable");
  const business = invoice?.business ?? snapshot.settings;
  const receiptRef = paymentReceiptRef(payment);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const ink = [18, 17, 16] as const;
  const muted = [105, 99, 92] as const;
  const accent = [107, 74, 50] as const;
  const margin = 20;
  const right = 190;
  const wrap = (value: string, width: number) => pdf.splitTextToSize(value, width) as string[];

  pdf.setTextColor(...ink);
  pdf.setFont("times", "bold");
  pdf.setFontSize(19);
  const businessNameLines = wrap(business.company_name || "The Good Chapter", 100);
  pdf.text(businessNameLines, margin, 28);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(payment.kind === "Refund" ? "REFUND ACKNOWLEDGEMENT" : "PAYMENT RECEIPT", right, 25, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...muted);
  pdf.text(receiptRef, right, 31, { align: "right" });

  const businessLines = [business.address, business.email, business.phone, business.gstin && `GSTIN: ${business.gstin}`]
    .filter(Boolean)
    .flatMap((line) => wrap(String(line), 105));
  const businessDetailsY = 32 + businessNameLines.length * 6;
  pdf.text(businessLines, margin, businessDetailsY);
  const topDivider = Math.max(58, businessDetailsY + businessLines.length * 4 + 2);
  pdf.setDrawColor(222, 216, 204);
  pdf.line(margin, topDivider, right, topDivider);

  pdf.setTextColor(...accent);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text(payment.kind === "Refund" ? "REFUND RECORDED" : "PAYMENT RECEIVED", margin, topDivider + 14);
  pdf.setTextColor(...ink);
  pdf.setFontSize(25);
  pdf.text(amountLabel(payment.amount), margin, topDivider + 27);

  const cardY = topDivider + 38;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  const fields = [
    { x: margin + 8, title: "DATE", value: dateLabel(payment.payment_date), width: 48 },
    { x: margin + 65, title: "METHOD", value: payment.method, width: 48 },
    { x: margin + 115, title: "TRANSACTION REFERENCE", value: payment.reference || "Not provided", width: 46 },
  ].map((field) => ({ ...field, lines: wrap(field.value, field.width) }));
  const cardHeight = Math.max(34, 22 + Math.max(...fields.map((field) => field.lines.length)) * 4);
  pdf.setFillColor(244, 241, 234);
  pdf.rect(margin, cardY, right - margin, cardHeight, "F");
  for (const field of fields) {
    pdf.setTextColor(...muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.text(field.title, field.x, cardY + 10);
    pdf.setTextColor(...ink);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(field.lines, field.x, cardY + 18);
  }

  const detailsY = cardY + cardHeight + 14;
  pdf.setTextColor(...accent);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text(payment.kind === "Refund" ? "REFUNDED TO" : "RECEIVED FROM", margin, detailsY);
  pdf.text("FOR ORDER", 112, detailsY);
  pdf.setTextColor(...ink);
  pdf.setFontSize(11);
  const clientName = client.organisation || client.name;
  const clientNameLines = wrap(clientName, 78);
  const orderRefLines = wrap(order.ref, 78);
  pdf.text(clientNameLines, margin, detailsY + 8);
  pdf.text(orderRefLines, 112, detailsY + 8);
  pdf.setTextColor(...muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  const recipientLines = [client.organisation && client.name, client.billing_address, client.email]
    .filter(Boolean)
    .flatMap((line) => wrap(String(line), 78));
  const recipientY = detailsY + 8 + clientNameLines.length * 5 + 3;
  pdf.text(recipientLines, margin, recipientY);
  const orderLines = [order.title, invoice ? `Invoice: ${invoice.ref}` : "Advance against order"]
    .flatMap((line) => wrap(line, 78));
  const orderY = detailsY + 8 + orderRefLines.length * 5 + 3;
  pdf.text(orderLines, 112, orderY);

  const noteY = Math.max(detailsY + 48, recipientY + recipientLines.length * 4.5 + 6, orderY + orderLines.length * 4.5 + 6);
  pdf.setDrawColor(222, 216, 204);
  pdf.line(margin, noteY, right, noteY);
  pdf.setTextColor(...muted);
  pdf.setFontSize(8.5);
  pdf.text(
    wrap("This acknowledges a payment recorded against the order above. Please retain the invoice for tax details; this receipt does not replace a tax invoice.", 170),
    margin,
    noteY + 10,
  );
  pdf.setFontSize(7.5);
  pdf.text(`Payment ID: ${payment.id}`, margin, 280);
  pdf.text("The Good Chapter", right, 280, { align: "right" });

  return { pdf, filename: `${receiptRef}.pdf` };
}
