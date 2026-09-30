"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import DocumentView from "./DocumentView";
import type { CommercialDocument } from "@/lib/types";
export default function SharedDocument({ doc }: { doc: CommercialDocument }) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="share-page">
      <div className="print-actions">
        <span className="eyebrow">THE GOOD CHAPTER</span>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await (await import("@/lib/document-pdf")).downloadDocument(doc);
            } catch {
              toast.error("Could not create PDF");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={15} />
          {busy ? "Preparing…" : "Download PDF"}
        </button>
      </div>
      <DocumentView doc={doc} />
    </main>
  );
}
