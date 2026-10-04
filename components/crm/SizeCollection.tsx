"use client";

import { useState } from "react";
import type { OrderSizeEntry, SharedOrderSizes } from "@/lib/types";

export default function SizeCollection({
  initial,
  token,
}: {
  initial: SharedOrderSizes;
  token: string;
}) {
  const [entries, setEntries] = useState<OrderSizeEntry[]>(initial.entries);
  const [version, setVersion] = useState(initial.version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const update = (id: string, field: keyof OrderSizeEntry, value: string) => {
    setEntries((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
    setSaved(false);
  };

  return (
    <main className="sizes-page">
      <header className="sizes-header">
        <span className="eyebrow">THE GOOD CHAPTER</span>
        <h1>Size details</h1>
        <p>
          {initial.title} · {initial.order_ref}
        </p>
        <p>
          Add one person for each item they need. You can return to this link to
          update the list until your order is printed.
        </p>
      </header>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setSaved(false);
          try {
            const response = await fetch("/api/order-sizes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, version, entries }),
            });
            const result = await response.json();
            if (!response.ok)
              throw new Error(result.error || "Could not save sizes");
            setVersion(result.version);
            setSaved(true);
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Could not save sizes",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {initial.items.map((item) => {
          const rows = entries.filter((entry) => entry.item === item);
          return (
            <section className="sizes-card" key={item}>
              <div className="sizes-section-head">
                <div>
                  <span className="eyebrow">ITEM</span>
                  <h2>{item}</h2>
                  <p>
                    {rows.length} {rows.length === 1 ? "person" : "people"}
                  </p>
                </div>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setEntries((current) => [
                      ...current,
                      {
                        id: crypto.randomUUID(),
                        item,
                        name: "",
                        phone: "",
                        print_name: "",
                        size: "",
                      },
                    ]);
                    setSaved(false);
                  }}
                >
                  + Add person
                </button>
              </div>
              {rows.length === 0 && (
                <p className="sizes-empty">No sizes added for this item yet.</p>
              )}
              {rows.map((row, index) => (
                <div className="sizes-entry" key={row.id}>
                  <div className="sizes-entry-head">
                    <strong>Person {index + 1}</strong>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setEntries((current) =>
                          current.filter((entry) => entry.id !== row.id),
                        );
                        setSaved(false);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="sizes-grid">
                    <label>
                      Name{" "}
                      <input
                        required
                        maxLength={100}
                        autoComplete="name"
                        value={row.name}
                        onChange={(e) => update(row.id, "name", e.target.value)}
                        placeholder="Full name"
                      />
                    </label>
                    <label>
                      Phone number{" "}
                      <input
                        type="tel"
                        maxLength={30}
                        value={row.phone}
                        onChange={(e) =>
                          update(row.id, "phone", e.target.value)
                        }
                        placeholder="Optional"
                      />
                    </label>
                    <label>
                      Name to print{" "}
                      <input
                        maxLength={80}
                        value={row.print_name}
                        onChange={(e) =>
                          update(row.id, "print_name", e.target.value)
                        }
                        placeholder="Optional"
                      />
                    </label>
                    <label>
                      Size{" "}
                      <input
                        required
                        maxLength={30}
                        list="size-options"
                        value={row.size}
                        onChange={(e) => update(row.id, "size", e.target.value)}
                        placeholder="e.g. M or 40"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </section>
          );
        })}
        <datalist id="size-options">
          {["XS", "S", "M", "L", "XL", "XXL", "XXXL"].map((size) => (
            <option key={size} value={size} />
          ))}
        </datalist>
        <div className="sizes-save">
          <p>
            Only people with this link can see or edit this list. Please share
            it with your team carefully.
          </p>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save size details"}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="form-success" role="status">
            Size details saved. You can return to this link to make changes.
          </p>
        )}
      </form>
    </main>
  );
}
