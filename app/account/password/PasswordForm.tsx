"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { createClient } from "@/lib/supabase/client";

export default function PasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="auth-screen">
      <form
        className="auth-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          if (password.length < 12) {
            setError("Use at least 12 characters for your password.");
            return;
          }
          if (password !== confirmation) {
            setError("The passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            const { error: updateError } = await createClient().auth.updateUser(
              {
                password,
              },
            );
            if (updateError) throw updateError;
            router.replace("/");
            router.refresh();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not save your password. Please try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="auth-brand">
          <Image
            src="/logo.svg"
            alt="The Good Chapter"
            width={210}
            height={52}
            priority
          />
          <span>STUDIO CRM</span>
        </div>
        <div>
          <h1>Choose a password.</h1>
          <p className="auth-intro">
            This password will let you sign in with your email next time.
          </p>
        </div>
        <label>
          New password
          <PasswordInput
            required
            autoComplete="new-password"
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Confirm password
          <PasswordInput
            required
            autoComplete="new-password"
            minLength={12}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save password →"}
        </button>
        <div className="auth-options">
          <Link href="/">Back to workspace</Link>
        </div>
      </form>
    </main>
  );
}
