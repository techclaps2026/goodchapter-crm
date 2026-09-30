"use client";
import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import type { Mutate } from "./use-crm";
import { Badge } from "./shared";
export default function Settings({
  s,
  mutate,
  busy,
}: {
  s: Snapshot;
  mutate: Mutate;
  busy: boolean;
}) {
  const [v, setV] = useState(s.settings);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [inviting, setInviting] = useState(false);
  if (s.profile.role !== "owner")
    return (
      <div className="panel">
        <h2>Owner access required</h2>
        <p>Workspace settings and team access are managed by your owner.</p>
      </div>
    );
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };
  return (
    <div className="two-col">
      <div className="stack">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const {
              company_name,
              email,
              phone,
              address,
              gstin,
              bank_details,
              terms,
            } = v;
            run(() =>
              mutate("save_settings", {
                company_name,
                email,
                phone,
                address,
                gstin,
                bank_details,
                terms,
              }),
            );
          }}
        >
          <h2>Business & documents</h2>
          <p style={{ margin: "8px 0 22px" }}>
            These details are saved into new quotations. Existing accepted
            documents stay unchanged.
          </p>
          <div className="field-grid">
            {(
              [
                "company_name",
                "email",
                "phone",
                "gstin",
                "address",
                "bank_details",
                "terms",
              ] as const
            ).map((k) => (
              <label
                key={k}
                className={
                  ["address", "bank_details", "terms"].includes(k) ? "wide" : ""
                }
              >
                {
                  {
                    company_name: "Business name",
                    email: "Email",
                    phone: "Phone",
                    gstin: "GSTIN (optional)",
                    address: "Business address",
                    bank_details: "Payment / bank details",
                    terms: "Default terms",
                  }[k]
                }
                {["address", "bank_details", "terms"].includes(k) ? (
                  <textarea
                    value={v[k]}
                    onChange={(e) => setV({ ...v, [k]: e.target.value })}
                  />
                ) : (
                  <input
                    required={k === "company_name"}
                    type={k === "email" ? "email" : "text"}
                    value={v[k]}
                    onChange={(e) => setV({ ...v, [k]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="form-footer">
            <button className="button primary" disabled={busy}>
              Save business details
            </button>
          </div>
        </form>
        <div className="panel">
          <h2>Workspace defaults</h2>
          <dl className="kv" style={{ marginTop: 20 }}>
            <dt>Currency</dt>
            <dd>INR · Indian rupee</dd>
            <dt>Timezone</dt>
            <dd>Asia/Kolkata</dd>
            <dt>Sharing</dt>
            <dd>Manual · PDFs and revocable document links</dd>
            <dt>Tax rates</dt>
            <dd>Entered per quotation item; no rates assumed</dd>
          </dl>
        </div>
      </div>
      <div className="stack">
        <section className="panel">
          <h2>Team access</h2>
          <p style={{ fontSize: 12, margin: "8px 0 18px" }}>
            Staff share CRM and order work. Costs, margins and access settings
            are owner-only.
          </p>
          {s.profiles.map((p) => (
            <div
              key={p.id}
              style={{
                borderTop: "1px solid var(--border)",
                padding: "16px 0",
              }}
            >
              <div className="row between">
                <strong>{p.full_name || "Team member"}</strong>
                <Badge>{p.active ? p.role : "Inactive"}</Badge>
              </div>
              {p.id !== s.profile.id && (
                <div className="row" style={{ marginTop: 10 }}>
                  <select
                    aria-label={`Role for ${p.full_name}`}
                    disabled={busy}
                    style={{ width: 110 }}
                    value={p.role}
                    onChange={(e) =>
                      run(() =>
                        mutate("update_user", {
                          id: p.id,
                          full_name: p.full_name,
                          role: e.target.value,
                          active: p.active,
                        }),
                      )
                    }
                  >
                    <option value="staff">Staff</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        mutate("update_user", {
                          id: p.id,
                          full_name: p.full_name,
                          role: p.role,
                          active: !p.active,
                        }),
                      )
                    }
                  >
                    {p.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
        <form
          className="panel stack"
          style={{ gap: 14 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const el = e.currentTarget;
            const fd = new FormData(el);
            setInviting(true);
            setSent("");
            await run(async () => {
              const r = await fetch("/api/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(Object.fromEntries(fd)),
              });
              const result = await r.json();
              if (!r.ok) throw new Error(result.error);
              setSent("Invitation sent. They will join as staff.");
              el.reset();
            });
            setInviting(false);
          }}
        >
          <h3>Invite a teammate</h3>
          <label>
            Full name
            <input name="full_name" required />
          </label>
          <label>
            Work email
            <input name="email" type="email" required />
          </label>
          <button disabled={inviting || s.demo} className="button">
            {inviting ? "Sending…" : "Send invitation"}
          </button>
          {s.demo && (
            <p style={{ fontSize: 11 }}>
              Invitations are disabled in the local preview.
            </p>
          )}
          {sent && <p role="status">{sent}</p>}
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
