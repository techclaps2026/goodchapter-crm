"use client";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";
import { canManageUsers } from "@/lib/types";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { ArrowUpRight } from "lucide-react";

type MailSettings = {
  sender_name: string;
  sender_email: string;
  reply_to_email: string;
  inbound_address: string;
  signature: string;
};

export default function MailIntegration({
  role,
  demo,
}: {
  role: Role;
  demo: boolean;
}) {
  const [settings, setSettings] = useState<MailSettings | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mailbox, setMailbox] = useState<{
    connected: boolean;
    email?: string;
  } | null>(null);
  const [mailboxEmail, setMailboxEmail] = useState("hello@thegoodchapter.in");
  const [mailboxPassword, setMailboxPassword] = useState("");
  useEffect(() => {
    fetch("/api/mail")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSettings(data.settings);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load email settings",
        ),
      );
    fetch("/api/mail/mailbox")
      .then((response) => response.json())
      .then((result) => {
        setMailbox(result);
        if (result.email) setMailboxEmail(result.email);
      })
      .catch(() => {});
  }, []);
  if (!canManageUsers(role)) return null;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/mail/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName: settings.sender_name,
          senderEmail: settings.sender_email,
          replyToEmail: settings.reply_to_email,
          inboundAddress: settings.inbound_address,
          signature: settings.signature,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save email settings");
      setMessage(
        "Email settings saved. Send a one-client test mailshot before sending to a list.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save email settings",
      );
    } finally {
      setBusy(false);
    }
  };
  const change = (key: keyof MailSettings, value: string) =>
    setSettings((current) =>
      current ? { ...current, [key]: value } : current,
    );
  const connectMailbox = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/mail/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: mailboxEmail,
          password: mailboxPassword,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not connect mailbox");
      setMailbox(result);
      setMailboxPassword("");
      setSettings((current) =>
        current
          ? {
              ...current,
              sender_email: result.email,
              reply_to_email: result.email,
            }
          : current,
      );
      setMessage(
        "Mailbox connected. Open Mail center → Inbox and choose Sync inbox.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not connect mailbox",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel" id="email-integration">
      <h2>Email integration</h2>
      <p>
        Choose the address your clients see. Mailshots are sent through Resend.
        Connect your GoDaddy Professional Email mailbox to read incoming
        messages in the CRM.
      </p>
      {settings && (
        <form className="stack mail-settings-form" onSubmit={save}>
          <div className="field-grid">
            <label>
              Sender name
              <input
                required
                value={settings.sender_name}
                onChange={(event) => change("sender_name", event.target.value)}
              />
            </label>
            <label>
              Send from
              <input
                required
                type="email"
                list="mail-addresses"
                disabled={!!mailbox?.connected}
                value={settings.sender_email}
                onChange={(event) => change("sender_email", event.target.value)}
              />
            </label>
            <label>
              Replies go to
              <input
                required
                type="email"
                list="mail-addresses"
                disabled={!!mailbox?.connected}
                value={settings.reply_to_email}
                onChange={(event) =>
                  change("reply_to_email", event.target.value)
                }
              />
            </label>
            <label className="wide">
              Signature
              <textarea
                rows={3}
                value={settings.signature}
                onChange={(event) => change("signature", event.target.value)}
                placeholder="The Good Chapter team"
              />
            </label>
          </div>
          {mailbox?.connected && (
            <p className="mail-note">
              From and Reply-to use the connected mailbox. Replace the
              connection below to change the address.
            </p>
          )}
          <datalist id="mail-addresses">
            <option value="hello@thegoodchapter.in" />
            <option value="studio@thegoodchapter.in" />
          </datalist>
          <p className="mail-note">
            The send-from domain must be verified in Resend. Delivery, bounce
            and open updates can be checked with Refresh tracking in Mail
            center. Live updates require the Resend webhook at{" "}
            <code>/api/mail/webhook</code>; open tracking must be enabled for
            the sending domain.
          </p>
          <div className="row">
            <button className="button primary" disabled={busy || demo}>
              {busy ? "Saving…" : "Save email settings"}
            </button>
            <a
              className="text-link"
              href="https://resend.com/webhooks"
              target="_blank"
              rel="noreferrer"
            >
              Open Resend webhooks <ArrowUpRight className="inline-arrow" aria-hidden="true" />
            </a>
          </div>
        </form>
      )}
      <form className="stack mail-settings-form" onSubmit={connectMailbox}>
        <h3>CRM inbox · GoDaddy Professional Email</h3>
        <p>
          {mailbox?.connected
            ? `Connected to ${mailbox.email}.`
            : "Connect the existing mailbox without changing its MX records or buying forwarding."}
        </p>
        <div className="field-grid">
          <label>
            Mailbox address
            <input
              required
              type="email"
              autoComplete="username"
              value={mailboxEmail}
              onChange={(event) => setMailboxEmail(event.target.value)}
            />
          </label>
          <label>
            Mailbox password
            <PasswordInput
              required
              autoComplete="current-password"
              value={mailboxPassword}
              onChange={(event) => setMailboxPassword(event.target.value)}
            />
          </label>
        </div>
        <p className="mail-note">
          The CRM checks the password against GoDaddy’s secure IMAP server, then
          stores it encrypted on the server. It is never shown again. Syncing
          reads the latest messages without moving or deleting them in GoDaddy.
          Use the email mailbox password, not your GoDaddy account password.
        </p>
        <div>
          <button
            className="button"
            disabled={busy || !mailboxPassword || demo}
          >
            {busy
              ? "Connecting…"
              : mailbox?.connected
                ? "Replace mailbox connection"
                : "Connect mailbox"}
          </button>
        </div>
      </form>
      <details className="mail-settings-form">
        <summary>Optional Resend inbound forwarding</summary>
        <p className="mail-note">
          If you later use a mailbox plan with forwarding, enter its Resend
          receiving address here and use the same webhook. Your current GoDaddy
          Pro Light plan does not need this.
        </p>
        {settings && (
          <label>
            Resend receiving address
            <input
              type="email"
              value={settings.inbound_address}
              onChange={(event) =>
                change("inbound_address", event.target.value)
              }
              placeholder="your-address@your-id.resend.app"
            />
          </label>
        )}
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="mail-success" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
