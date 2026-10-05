"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { Payment, Snapshot } from "@/lib/types";

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PaymentReceiptActions({
  payment,
  snapshot,
}: {
  payment: Payment;
  snapshot: Snapshot;
}) {
  const [busy, setBusy] = useState(false);
  const act = async (share: boolean) => {
    setBusy(true);
    try {
      const { createPaymentReceiptPdf } = await import("@/lib/payment-receipt");
      const { pdf, filename } = createPaymentReceiptPdf(snapshot, payment);
      const file = new File([pdf.output("blob")], filename, { type: "application/pdf" });
      let canShareFile = false;
      if (share && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
        try {
          canShareFile = navigator.canShare({ files: [file] });
        } catch {
          canShareFile = false;
        }
      }
      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: filename });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          downloadFile(file);
          toast.info("Receipt downloaded. Attach the PDF to your message.");
        }
      } else {
        downloadFile(file);
        if (share) toast.info("Receipt downloaded. Attach the PDF to your message.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare receipt");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row payment-receipt-actions">
      <button type="button" className="button small" disabled={busy} onClick={() => act(false)} title="Download payment receipt PDF">
        <Download size={14} aria-hidden="true" /> Receipt PDF
      </button>
      <button type="button" className="button small" disabled={busy} onClick={() => act(true)} title="Share payment receipt PDF">
        <Share2 size={14} aria-hidden="true" /> Share
      </button>
    </div>
  );
}
