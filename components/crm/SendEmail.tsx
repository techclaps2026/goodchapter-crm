"use client";
import { useRef, useState } from "react";
import type { CommercialDocument } from "@/lib/types";
import { money } from "@/lib/domain";
import { toast } from "sonner";
export default function SendEmail({
  doc,
  demo,
  onDone,
}: {
  doc: CommercialDocument;
  demo: boolean;
  onDone: () => void;
}) {
  const key = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const r = await fetch("/api/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ document_id: doc.id, key: key.current }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          toast.success(data.message);
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not send");
        } finally {
          setBusy(false);
        }
      }}
    >
      <dl className="kv">
        <dt>Recipient</dt>
        <dd>{doc.customer.email || "No email on document"}</dd>
        <dt>Subject</dt>
        <dd>
          {doc.ref} · {doc.title} | The Good Chapter
        </dd>
        <dt>Document total</dt>
        <dd>{money(doc.total)}</dd>
      </dl>
      <div className="panel">
        <p>Hello {doc.customer.name},</p>
        <p style={{ marginTop: 12 }}>
          Your {doc.kind === "quote" ? "quotation" : "invoice"} for {doc.title}{" "}
          is ready.
        </p>
        <p style={{ marginTop: 12 }}>
          The email includes the document reference, total and a link to
          view/download the PDF.
        </p>
      </div>
      {demo && <p>Sending is disabled in the fictional local preview.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary"
        disabled={busy || demo || !doc.customer.email}
      >
        {busy ? "Sending…" : "Send email"}
      </button>
    </form>
  );
}
