"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import DocumentView from "./DocumentView";
import type { CommercialDocument } from "@/lib/types";
export default function SharedDocument({ doc, token }: { doc: CommercialDocument; token: string }) {
  const [busy, setBusy] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>(doc.quote_selections ?? {});
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
              await (await import("@/lib/document-pdf")).downloadDocument(doc, token);
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
      <DocumentView doc={doc} shareToken={token} selections={selections}
        onSelect={doc.kind === "quote" && doc.status === "Sent"
          ? (groupId, optionId) => setSelections((current) => ({ ...current, [groupId]: optionId }))
          : undefined} />
      {doc.kind === "quote" && doc.status === "Sent" && (doc.quote_options?.length ?? 0) > 0 && (
        <div className="quote-choice-submit">
          <p>Send your choices to The Good Chapter. We’ll confirm the final combination and price in an updated quotation.</p>
          <button className="button primary" disabled={busy || !doc.quote_options?.every((group) => selections[group.id])}
            onClick={async () => {
              setBusy(true);
              try {
                const response = await fetch("/api/quote-choice", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token, choices: selections }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Could not send choices");
                toast.success("Choices sent to The Good Chapter");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not send choices");
              } finally {
                setBusy(false);
              }
            }}>{busy ? "Sending…" : "Send my choices"}</button>
        </div>
      )}
    </main>
  );
}
