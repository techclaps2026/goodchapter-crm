"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import type { CommercialDocument } from "@/lib/types";
import { invoiceUpiUri } from "@/lib/payment-qr";

export default function PaymentQr({ doc }: { doc: CommercialDocument }) {
  const uri = invoiceUpiUri(doc);
  const [image, setImage] = useState("");

  useEffect(() => {
    let active = true;
    if (!uri) return;
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
  }, [uri]);

  if (!uri) return null;
  return (
    <div className="invoice-payment-qr">
      <div>
        <div className="eyebrow">PAY BY UPI</div>
        <p>Scan with Google Pay or another UPI app.</p>
        <p>Enter the outstanding amount shown on this invoice before paying.</p>
        <p>Payee: {doc.business.upi_id}</p>
        <a href={uri} className="text-link">
          Open UPI app ↗
        </a>
      </div>
      {image && (
        <Image
          src={image}
          alt={`UPI payment QR for invoice ${doc.ref}`}
          width={150}
          height={150}
          unoptimized
        />
      )}
    </div>
  );
}
