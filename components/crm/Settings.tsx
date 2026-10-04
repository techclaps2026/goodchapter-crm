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
import { useConfirm } from "@/components/ui/confirm-dialog";
import SocialConnections from "./SocialConnections";
import BufferConnection from "./BufferConnection";
import MailIntegration from "./MailIntegration";
import { createClient } from "@/lib/supabase/client";
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
  const [upiId, setUpiId] = useState(s.settings.upi_id);
  const [savingUpi, setSavingUpi] = useState(false);
  const [upiError, setUpiError] = useState("");
  const [upiSaved, setUpiSaved] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [inviting, setInviting] = useState(false);
  const [changingUser, setChangingUser] = useState<string | null>(null);
  const confirm = useConfirm();
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
  const changeUserAccess = async (id: string, removed: boolean) => {
    setChangingUser(id);
    await run(async () => {
      const response = await fetch("/api/team/access", {
        method: removed ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not update user");
      await refresh();
    });
    setChangingUser(null);
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
          <form
            className="panel stack"
            id="payment-qr"
            onSubmit={async (event) => {
              event.preventDefault();
              const value = upiId.trim().toLowerCase();
              setUpiError("");
              setUpiSaved(false);
              if (value && !/^[a-z0-9._-]+@[a-z0-9._-]+$/.test(value)) {
                setUpiError(
                  "Enter a valid UPI ID, such as business@bank. Use the ID, not a payment link or QR image.",
                );
                return;
              }
              setSavingUpi(true);
              try {
                const { error: saveError } = await createClient().rpc(
                  "save_payment_upi",
                  { p_upi_id: value },
                );
                if (saveError)
                  throw new Error(saveError.message || "Could not save UPI ID");
                setUpiId(value);
                await refresh();
                setUpiSaved(true);
              } catch (cause) {
                setUpiError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not save UPI ID. Please try again.",
                );
              } finally {
                setSavingUpi(false);
              }
            }}
          >
            <h2>Invoice payment QR</h2>
            <p>
              Enter the UPI ID shown in your Google Pay for Business account.
              You can then add a QR to individual invoices.
            </p>
            <label>
              Business UPI ID
              <input
                value={upiId}
                onChange={(event) => {
                  setUpiId(event.target.value);
                  setUpiError("");
                  setUpiSaved(false);
                }}
                placeholder="business@bank"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={120}
                aria-invalid={Boolean(upiError)}
                aria-describedby={upiError ? "upi-error" : undefined}
              />
            </label>
            {upiError && (
              <p className="form-error" id="upi-error" role="alert">
                {upiError}
              </p>
            )}
            {upiSaved && (
              <p className="form-success" role="status">
                {upiId ? "UPI ID saved." : "UPI ID removed."}
              </p>
            )}
            <p className="muted">
              QR payments must be confirmed in your payment account and recorded
              in the CRM. Existing invoice QR codes keep the UPI ID saved when
              they were added.
            </p>
            <div className="form-footer">
              <button className="button primary" disabled={savingUpi}>
                {savingUpi ? "Saving…" : "Save UPI ID"}
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
          <BufferConnection role={s.profile.role} />
          <MailIntegration role={s.profile.role} demo={s.demo} />
          <details className="panel">
            <summary>Direct developer app connections · advanced</summary>
            <p style={{ margin: "12px 0" }}>
              Only needed if you later register your own Instagram or LinkedIn
              developer apps. Buffer publishing uses the connection above.
            </p>
            <SocialConnections role={s.profile.role} />
          </details>
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
            {s.profiles
              .filter((p) => !p.deleted_at)
              .map((p) => (
                <div key={p.id} className="team-user-row">
                  <div className="team-user-details">
                    <div className="team-user-name">
                      <strong>{p.full_name || "Team member"}</strong>
                      <Badge>
                        {p.active ? roleLabels[p.role] : "Inactive"}
                      </Badge>
                    </div>
                    {p.email && <p>{p.email}</p>}
                  </div>
                  {p.id !== s.profile.id && (
                    <div className="team-user-actions">
                      <label className="team-role-field">
                        Access level
                        <select
                          aria-label={`Role for ${p.full_name || p.email}`}
                          disabled={busy || changingUser !== null}
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
                        disabled={busy || changingUser !== null}
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
                      <button
                        type="button"
                        className="button small danger"
                        disabled={busy || changingUser !== null || s.demo}
                        onClick={async () => {
                          const agreed = await confirm({
                            title: `Delete ${p.full_name || p.email || "this user"}?`,
                            description:
                              "This removes their CRM access and moves them out of the team list. Existing orders, payments and audit history stay linked. An Owner or Admin can restore the account later.",
                            confirmLabel: "Delete user",
                            destructive: true,
                          });
                          if (agreed) await changeUserAccess(p.id, true);
                        }}
                      >
                        Delete user
                      </button>
                    </div>
                  )}
                </div>
              ))}
            {s.profiles.some((p) => p.deleted_at) && (
              <details className="team-removed">
                <summary>
                  Deleted users ({s.profiles.filter((p) => p.deleted_at).length}
                  )
                </summary>
                <p>Restored users remain inactive until you reactivate them.</p>
                {s.profiles
                  .filter((p) => p.deleted_at)
                  .map((p) => (
                    <div className="team-user-row" key={p.id}>
                      <div className="team-user-details">
                        <strong>{p.full_name || "Team member"}</strong>
                        {p.email && <p>{p.email}</p>}
                      </div>
                      <button
                        type="button"
                        className="button small"
                        disabled={busy || changingUser !== null || s.demo}
                        onClick={() => changeUserAccess(p.id, false)}
                      >
                        Restore user
                      </button>
                    </div>
                  ))}
              </details>
            )}
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
