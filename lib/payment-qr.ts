import type { CommercialDocument } from "./types";

export function invoicePaymentQrImageUrl(
  doc: CommercialDocument,
): string | null {
  const path = doc.business.payment_qr_path;
  return doc.kind === "invoice" &&
    doc.payment_qr_enabled &&
    path &&
    /^[0-9a-f-]{36}\.(png|jpg)$/.test(path)
    ? `/api/payment-qr?path=${encodeURIComponent(path)}`
    : null;
}

export function invoiceUpiUri(doc: CommercialDocument): string | null {
  const upiId = doc.business.upi_id?.trim();
  if (
    doc.kind !== "invoice" ||
    !doc.payment_qr_enabled ||
    !upiId ||
    !/^[a-z0-9._-]+@[a-z0-9._-]+$/i.test(upiId)
  )
    return null;

  // The amount is entered by the payer because an invoice can have advances
  // and partial payments after a PDF has been downloaded.
  const params = new URLSearchParams({
    pa: upiId,
    pn: doc.business.company_name,
    tn: `Invoice ${doc.ref}`,
    cu: "INR",
  });
  return `upi://pay?${params.toString()}`;
}
