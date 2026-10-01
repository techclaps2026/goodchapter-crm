"use client";
import { useState } from "react";
import {
  canManageUsers,
  hasOwnerAccess,
  roleLabels,
  type Role,
  type Snapshot,
} from "@/lib/types";
import type { Mutate } from "./use-crm";
import { Badge } from "./shared";
export default function Settings({
  s,
  mutate,
  busy,
  refresh,
  mode,
}: {
  s: Snapshot;
  mutate: Mutate;
  busy: boolean;
  refresh: () => Promise<unknown>;
  mode: "business" | "users";
}) {
  const [v, setV] = useState(s.settings);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [inviting, setInviting] = useState(false);
  if (mode === "users" && !canManageUsers(s.profile.role))
    return (
      <div className="panel">
        <h2>Owner or Admin access required</h2>
      </div>
    );
  if (mode === "business" && !hasOwnerAccess(s.profile.role))
    return (
      <div className="panel">
        <h2>Admin access required</h2>
        <p>Business settings are managed by the leadership team.</p>
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
    <div className="settings-section">
      {mode === "business" && (
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
                    ["address", "bank_details", "terms"].includes(k)
                      ? "wide"
                      : ""
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
            <h2>CRM defaults</h2>
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
          <section className="panel stack" id="integrations">
            <div>
              <h2>Integrations</h2>
              <p style={{ marginTop: 8 }}>
                Services connected to this CRM. Credentials stay in their
                service settings and are never shown here.
              </p>
            </div>
            <div className="row between">
              <div>
                <strong>Supabase</strong>
                <p>Database and team sign-in</p>
              </div>
              <Badge>
                {s.integrations.supabase ? "Configured" : "Needs setup"}
              </Badge>
            </div>
            <div className="row between">
              <div>
                <strong>Resend</strong>
                <p>Manual quotation and invoice emails</p>
                {s.integrations.sender && (
                  <small>{s.integrations.sender}</small>
                )}
              </div>
              <Badge>
                {s.integrations.resend ? "Configured" : "Needs setup"}
              </Badge>
            </div>
            <div className="row between">
              <div>
                <strong>Vercel</strong>
                <p>CRM hosting</p>
                {s.integrations.appUrl && (
                  <small>{s.integrations.appUrl}</small>
                )}
              </div>
              <Badge>
                {s.integrations.appUrl ? "Configured" : "Needs setup"}
              </Badge>
            </div>
            <p style={{ fontSize: 11 }}>
              Sign-in emails use Supabase SMTP. Delivery status and SMTP
              settings are managed in Supabase; document email activity is in
              Resend.
            </p>
          </section>
        </div>
      )}
      {mode === "users" && (
        <div className="stack">
          <section className="panel" id="users">
            <h2>Users & roles</h2>
            <p style={{ fontSize: 12, margin: "8px 0 18px" }}>
              Staff share CRM and order work. Owner and Admin manage users.
              Co-owner has business and finance access but cannot manage users.
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
                  <div>
                    <strong>{p.full_name || "Team member"}</strong>
                    {p.email && (
                      <p style={{ fontSize: 12, marginTop: 4 }}>{p.email}</p>
                    )}
                  </div>
                  <Badge>{p.active ? roleLabels[p.role] : "Inactive"}</Badge>
                </div>
                {p.id !== s.profile.id && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <label>
                      Access level
                      <select
                        aria-label={`Role for ${p.full_name || p.email}`}
                        disabled={busy}
                        style={{ width: 150 }}
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
                        <option value="co_owner">Co-owner</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    </label>
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
                await refresh();
                const role = fd.get("role") as Role;
                setSent(
                  `Invitation sent. They will join as ${roleLabels[role]}.`,
                );
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
            <label>
              Access level
              <select name="role" defaultValue="staff" required>
                <option value="staff">Staff · CRM and orders</option>
                <option value="admin">Admin · Full access</option>
                <option value="co_owner">
                  Co-owner · Business and finance
                </option>
                <option value="owner">Owner · Full access</option>
              </select>
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
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
