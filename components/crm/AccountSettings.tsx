"use client";

import Link from "next/link";
import { useState } from "react";
import { canManageUsers, roleLabels, type Snapshot } from "@/lib/types";

export default function AccountSettings({
  s,
  refresh,
}: {
  s: Snapshot;
  refresh: () => Promise<unknown>;
}) {
  const [name, setName] = useState(s.profile.full_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  return (
    <div className="two-col">
      <form
        className="panel stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setSaved(false);
          setBusy(true);
          try {
            const response = await fetch("/api/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ full_name: name }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            await refresh();
            setSaved(true);
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not save your name",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <h2>Your profile</h2>
          <p style={{ marginTop: 8 }}>The name your team sees in the CRM.</p>
        </div>
        <label>
          Full name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
            disabled={s.demo}
          />
        </label>
        <label>
          Sign-in email
          <input value={s.profile.email || ""} readOnly />
        </label>
        <label>
          Access level
          <input value={roleLabels[s.profile.role]} readOnly />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {saved && <p role="status">Profile updated.</p>}
        <div className="form-footer">
          <button className="button primary" disabled={busy || s.demo}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
      <div className="stack">
        <section className="panel stack">
          <div>
            <h2>Password & security</h2>
            <p style={{ marginTop: 8 }}>
              Change the password you use to sign in to this CRM.
            </p>
          </div>
          {!s.demo && (
            <Link className="button" href="/account/password">
              Set or change password →
            </Link>
          )}
        </section>
        <section className="panel stack">
          <h2>Team access</h2>
          <p>
            Owner and Admin manage users. Co-owner can see costs, margins and
            business settings. Staff can work with leads, orders and customer
            documents.
          </p>
          {canManageUsers(s.profile.role) && (
            <Link className="text-link" href="/users">
              Manage users and roles →
            </Link>
          )}
        </section>
        {s.profile.role !== "staff" && (
          <section className="panel stack">
            <h2>Integrations</h2>
            <p>
              Supabase sign-in and database · Resend document email · Vercel
              hosting
            </p>
            <Link className="text-link" href="/settings#integrations">
              View integration settings →
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
