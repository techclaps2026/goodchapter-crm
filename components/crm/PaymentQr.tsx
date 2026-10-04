"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import type { CommercialDocument } from "@/lib/types";
import { invoicePaymentQrImageUrl, invoiceUpiUri } from "@/lib/payment-qr";

export default function PaymentQr({ doc }: { doc: CommercialDocument }) {
  const uri = invoiceUpiUri(doc);
  const uploadedImage = invoicePaymentQrImageUrl(doc);
  const [image, setImage] = useState("");

  useEffect(() => {
    let active = true;
    if (!uri || uploadedImage) return;
    QRCode.toDataURL(uri, { margin: 1, width: 240 })
      .then((data) => {
        if (active) setImage(data);
      })
      .catch(() => {
        if (active) setImage("");
      });
    return () => {
      active = false;
    };
  }, [uri, uploadedImage]);

  if (!uri && !uploadedImage) return null;
  return (
    <div className="invoice-payment-qr">
      <div>
        <div className="eyebrow">PAY BY UPI</div>
        <p>Scan with Google Pay or another UPI app.</p>
        <p>Enter the outstanding amount shown on this invoice before paying.</p>
        {doc.business.upi_id && <p>Payee: {doc.business.upi_id}</p>}
        {uri && (
          <a href={uri} className="text-link">
            Open UPI app ↗
          </a>
        )}
      </div>
      {(uploadedImage || image) && (
        <Image
          src={uploadedImage || image}
          alt={`UPI payment QR for invoice ${doc.ref}`}
          width={150}
          height={150}
          unoptimized
        />
      )}
    </div>
  );
}
