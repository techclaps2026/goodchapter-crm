"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import DocumentView from "./DocumentView";
import type { CommercialDocument } from "@/lib/types";
type EngagementEvent = "open" | "scroll" | "pdf_click" | "option_click" | "choices_submit";
type TrackingContext = { visitId: string; visitorId: string; opened: Promise<boolean> };
type EventValues = { optionId?: string; scrollPercent?: number };

function sendEvent(token: string, context: TrackingContext, event: EngagementEvent, values: EventValues = {}) {
  return fetch("/api/quote-engagement", {
    method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
    body: JSON.stringify({ token, visitId: context.visitId, visitorId: context.visitorId, event, ...values }),
  });
}

export default function SharedDocument({ doc, token, trackEngagement = false }: {
  doc: CommercialDocument; token: string; trackEngagement?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>(doc.quote_selections ?? {});
  const tracking = useRef<TrackingContext | null>(null);
  const visit = useRef<{ token: string; id: string } | null>(null);
  const canChoose = doc.kind === "quote" && doc.status === "Sent" && doc.client_choice_enabled === true;
  const track = (event: EngagementEvent, values?: EventValues) => {
    const context = tracking.current;
    if (!context) return;
    void context.opened.then((opened) => {
      if (opened) return sendEvent(token, context, event, values).catch(() => {});
    });
  };
  useEffect(() => {
    if (!trackEngagement) return;
    const key = `tgc-quote-visitor:${token}`;
    let visitorId: string | null = null;
    try { visitorId = sessionStorage.getItem(key); } catch { /* Storage may be unavailable. */ }
    if (!visitorId || !/^[0-9a-f-]{36}$/i.test(visitorId)) {
      visitorId = crypto.randomUUID();
      try { sessionStorage.setItem(key, visitorId); } catch { /* A visit still works without storage. */ }
    }
    if (visit.current?.token !== token) visit.current = { token, id: crypto.randomUUID() };
    const context: TrackingContext = {
      visitId: visit.current.id, visitorId,
      opened: Promise.resolve(false),
    };
    context.opened = sendEvent(token, context, "open").then((response) => response.ok).catch(() => false);
    tracking.current = context;
    const sent = new Set<number>();
    const measureScroll = () => {
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      const percent = distance <= 0 ? 100 : Math.floor(window.scrollY / distance * 100);
      for (const milestone of [25, 50, 75, 100]) {
        if (percent >= milestone && !sent.has(milestone)) {
          sent.add(milestone);
          void context.opened.then((opened) => {
            if (opened) return sendEvent(token, context, "scroll", { scrollPercent: milestone }).catch(() => {});
          });
        }
      }
    };
    window.addEventListener("scroll", measureScroll, { passive: true });
    window.addEventListener("resize", measureScroll);
    measureScroll();
    return () => {
      window.removeEventListener("scroll", measureScroll);
      window.removeEventListener("resize", measureScroll);
      if (tracking.current === context) tracking.current = null;
    };
  }, [token, trackEngagement]);
  return (
    <main className="share-page">
      <div className="print-actions">
        <span className="eyebrow">THE GOOD CHAPTER</span>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            track("pdf_click");
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
        onSelect={canChoose
          ? (groupId, optionId) => {
              setSelections((current) => ({ ...current, [groupId]: optionId }));
              track("option_click", { optionId });
            }
          : undefined} />
      {canChoose && (doc.quote_options?.length ?? 0) > 0 && (
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
                track("choices_submit");
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
