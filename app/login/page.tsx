"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
export default function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <main className="auth-screen">
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const db = createClient();
            const { error } = await db.auth.signInWithOtp({
              email,
              options: {
                shouldCreateUser: false,
                emailRedirectTo: window.location.origin + "/auth/callback",
              },
            });
            if (error) throw error;
            setMessage("Check your email for your sign-in link.");
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not send link");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="eyebrow">THE GOOD CHAPTER · STUDIO CRM</div>
        <h1>Good to see you.</h1>
        <p>Your next good chapter starts here.</p>
        <label>
          Work email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Sending…" : "Email me a sign-in link →"}
        </button>
        <p role="status">{message}</p>
        <p className="muted">
          Access is by invitation. Ask your workspace owner to add you.
        </p>
      </form>
    </main>
  );
}
