"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "link" | "reset";

export default function LoginForm({ expiredLink }: { expiredLink: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<
    { text: string; error: boolean } | undefined
  >(
    expiredLink
      ? { text: "That link expired. Request another email.", error: true }
      : undefined,
  );

  const chooseMode = (next: Mode) => {
    setMode(next);
    setPassword("");
    setFeedback(undefined);
  };

  return (
    <main className="auth-screen">
      <form
        className="auth-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setFeedback(undefined);
          try {
            const db = createClient();
            if (mode === "password") {
              const { error } = await db.auth.signInWithPassword({
                email,
                password,
              });
              if (error) throw error;
              router.replace("/");
              router.refresh();
              return;
            }
            if (mode === "link") {
              const { error } = await db.auth.signInWithOtp({
                email,
                options: {
                  shouldCreateUser: false,
                  emailRedirectTo: window.location.origin + "/auth/callback",
                },
              });
              if (error) throw error;
              setFeedback({
                text: "If this address has workspace access, check your email for a sign-in link.",
                error: false,
              });
            } else {
              const { error } = await db.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + "/auth/callback",
              });
              if (error) throw error;
              setFeedback({
                text: "If this address has workspace access, check your email for a password link.",
                error: false,
              });
            }
          } catch {
            setFeedback({
              text:
                mode === "password"
                  ? "Could not sign in. Check your email and password."
                  : "Could not send email. Please try again.",
              error: true,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="auth-brand">
          <Image
            src="/logo-dark.svg"
            alt="The Good Chapter"
            width={210}
            height={52}
            priority
          />
          <span>STUDIO CRM</span>
        </div>
        <div>
          <h1>
            {mode === "reset"
              ? "Set your password."
              : mode === "link"
                ? "Check in by email."
                : "Good to see you."}
          </h1>
          <p className="auth-intro">
            {mode === "reset"
              ? "We’ll send a secure link so you can choose a password."
              : mode === "link"
                ? "We’ll email you a one-time sign-in link."
                : "Sign in to your studio workspace."}
          </p>
        </div>
        <label>
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {mode === "password" && (
          <label>
            Password
            <PasswordInput
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
        <button className="button primary" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "password"
              ? "Sign in →"
              : mode === "link"
                ? "Email me a sign-in link →"
                : "Email me a password link →"}
        </button>
        {feedback && (
          <p
            role={feedback.error ? "alert" : "status"}
            className={feedback.error ? "form-error" : "muted"}
          >
            {feedback.text}
          </p>
        )}
        <div className="auth-options">
          {mode !== "reset" && (
            <button type="button" onClick={() => chooseMode("reset")}>
              Set or reset password
            </button>
          )}
          {mode !== "link" && (
            <button type="button" onClick={() => chooseMode("link")}>
              Use an email sign-in link
            </button>
          )}
          {mode !== "password" && (
            <button type="button" onClick={() => chooseMode("password")}>
              Back to password sign-in
            </button>
          )}
        </div>
        <p className="muted auth-invite-note">
          Access is by invitation. Ask your workspace owner to add you.
        </p>
      </form>
    </main>
  );
}
