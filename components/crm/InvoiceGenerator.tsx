"use client";

import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/domain";
import type { Snapshot } from "@/lib/types";
import type { Mutate } from "./use-crm";

export default function InvoiceGenerator({
  s,
  mutate,
  busy,
  onDone,
}: {
  s: Snapshot;
  mutate: Mutate;
  busy: boolean;
  onDone: (id: string) => void;
}) {
  const eligible = s.orders.filter(
    (order) =>
      order.status !== "Cancelled" &&
      !s.documents.some(
        (document) =>
          document.kind === "invoice" &&
          document.order_id === order.id &&
          document.status !== "Superseded",
      ),
  );
  const [orderId, setOrderId] = useState(eligible[0]?.id || "");
  const [dueOn, setDueOn] = useState("");
  const [error, setError] = useState("");

  if (!eligible.length)
    return (
      <div className="stack">
        <p>
          There are no orders awaiting an invoice. Accept a quotation and create
          its order first. Each order has one itemised invoice.
        </p>
        <div className="row">
          <Link className="button primary" href="/quotations">
            View quotations →
          </Link>
          <Link className="button" href="/orders">
            View orders
          </Link>
        </div>
      </div>
    );

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          const result = await mutate("create_invoice", {
            id: orderId,
            due_on: dueOn || null,
          });
          onDone(result.id);
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Could not create invoice",
          );
        }
      }}
    >
      <p>
        The invoice copies the accepted quotation’s items, tax and client
        details. Recorded advances stay linked to the order.
      </p>
      <label>
        Order
        <select
          value={orderId}
          onChange={(event) => setOrderId(event.target.value)}
          required
        >
          {eligible.map((order) => {
            const quote = s.documents.find((d) => d.id === order.quote_id);
            return (
              <option key={order.id} value={order.id}>
                {order.ref} · {order.title} · {money(quote?.total || 0)}
              </option>
            );
          })}
        </select>
      </label>
      <label>
        Due date (optional)
        <input
          type="date"
          value={dueOn}
          onChange={(event) => setDueOn(event.target.value)}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button className="button primary" disabled={busy || !orderId}>
          Generate draft invoice →
        </button>
      </div>
    </form>
  );
}
