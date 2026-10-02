"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client, Role } from "@/lib/types";
import { canManageUsers } from "@/lib/types";

type Settings = {
  sender_name: string;
  sender_email: string;
  reply_to_email: string;
};
type Campaign = {
  id: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  sender_email: string;
};
type Recipient = {
  id: string;
  campaign_id: string;
  client_id: string | null;
  name: string;
  organisation: string;
  email: string;
  status: string;
  error: string | null;
  delivered_at: string | null;
  opened_at: string | null;
};
type InboxItem = {
  id: string;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  client_id: string | null;
  received_at: string;
};
type SentItem = {
  id: string;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  client_id: string | null;
  sent_at: string;
};
type Data = {
  settings: Settings | null;
  connection: { connected: boolean; email?: string };
  campaigns: Campaign[];
  recipients: Recipient[];
  inbox: InboxItem[];
  sent: SentItem[];
  demo?: boolean;
};
const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
const formatListDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
const initial: Data = {
  settings: null,
  connection: { connected: false },
  campaigns: [],
  recipients: [],
  inbox: [],
  sent: [],
};

export default function MailCenter({
  clients,
  role,
  demo,
}: {
  clients: Client[];
  role: Role;
  demo: boolean;
}) {
  const [data, setData] = useState<Data>(initial);
  const [tab, setTab] = useState<"compose" | "campaigns" | "inbox">("compose");
  const [step, setStep] = useState<"recipients" | "write" | "review">(
    "recipients",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sentSearch, setSentSearch] = useState("");
  const [sentFilter, setSentFilter] = useState("all");
  const [sentRange, setSentRange] = useState("all");
  const [filterNow, setFilterNow] = useState(0);
  const [inboxSearch, setInboxSearch] = useState("");
  const [inboxFilter, setInboxFilter] = useState("all");
  const [inboxRange, setInboxRange] = useState("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<string | null>(null);
  const [activeInbox, setActiveInbox] = useState<string | null>(null);
  const [activeSent, setActiveSent] = useState<string | null>(null);
  const sentSyncStarted = useRef(false);
  const inboxSyncing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mailboxEmail, setMailboxEmail] = useState("hello@thegoodchapter.in");
  const [mailboxPassword, setMailboxPassword] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/mail", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load mail");
    setData(result);
  }, []);
  useEffect(() => {
    fetch("/api/mail", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not load mail");
        setData(result);
        setLoadState("ready");
      })
      .catch((cause) => {
        setError(
          cause instanceof Error ? cause.message : "Could not load mail",
        );
        setLoadState("error");
      });
  }, []);
  const eligible = useMemo(
    () =>
      clients.filter(
        (client) =>
          !client.archived &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email.trim()),
      ),
    [clients],
  );
  const filtered = useMemo(
    () =>
      eligible.filter((client) =>
        `${client.name} ${client.organisation} ${client.email}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [eligible, search],
  );
  const toggle = (id: string) =>
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  const selectedClients = eligible.filter((client) =>
    selected.includes(client.id),
  );
  const campaign = data.campaigns.find((item) => item.id === activeCampaign);
  const inbox = data.inbox.find((item) => item.id === activeInbox);
  const sent = data.sent.find((item) => item.id === activeSent);
  const matchesRange = (date: string, range: string) =>
    range === "all" ||
    new Date(date).getTime() >= filterNow - Number(range) * 86400000;
  const matchingCampaigns = data.campaigns.filter((item) => {
    if (sentFilter === "mailbox") return false;
    if (sentFilter === "drafts" && item.status !== "draft") return false;
    if (sentFilter === "sent" && item.status === "draft") return false;
    if (!matchesRange(item.sent_at || item.created_at, sentRange)) return false;
    const recipients = data.recipients
      .filter((recipient) => recipient.campaign_id === item.id)
      .map((recipient) => `${recipient.name} ${recipient.email}`)
      .join(" ");
    return `${item.subject} ${item.body} ${recipients}`
      .toLowerCase()
      .includes(sentSearch.trim().toLowerCase());
  });
  const matchingSent = data.sent.filter(
    (item) =>
      sentFilter !== "drafts" &&
      sentFilter !== "mailshots" &&
      matchesRange(item.sent_at, sentRange) &&
      `${item.subject} ${item.from_email} ${item.to_email} ${item.body}`
        .toLowerCase()
        .includes(sentSearch.trim().toLowerCase()),
  );
  const matchingInbox = data.inbox.filter(
    (item) =>
      (inboxFilter === "all" ||
        (inboxFilter === "clients" && !!item.client_id) ||
        (inboxFilter === "other" && !item.client_id)) &&
      matchesRange(item.received_at, inboxRange) &&
      `${item.subject} ${item.from_email} ${item.to_email} ${item.body}`
        .toLowerCase()
        .includes(inboxSearch.trim().toLowerCase()),
  );
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mail request failed");
    } finally {
      setBusy(false);
    }
  };
  const saveDraft = async () => {
    const response = await fetch("/api/mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draftId, subject, body, clientIds: selected }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save draft");
    setDraftId(result.id);
    await refresh();
    return result.id as string;
  };
  const edit = (item: Campaign) => {
    setDraftId(item.id);
    setSubject(item.subject);
    setBody(item.body);
    setSelected(
      data.recipients
        .filter(
          (recipient) =>
            recipient.campaign_id === item.id && recipient.client_id,
        )
        .map((recipient) => recipient.client_id!),
    );
    setTab("compose");
    setStep("write");
    setActiveCampaign(null);
    setError("");
  };
  const reset = () => {
    setDraftId(null);
    setSubject("");
    setBody("");
    setSelected([]);
    setStep("recipients");
    setTab("compose");
    setActiveCampaign(null);
  };
  const send = () =>
    run(async () => {
      const id = await saveDraft();
      const response = await fetch(`/api/mail/${id}/send`, { method: "POST" });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not send mailshot");
      await refresh();
      setTab("campaigns");
      setActiveCampaign(id);
      setStep("recipients");
      setDraftId(null);
      setNotice(
        `${result.accepted} email${result.accepted === 1 ? "" : "s"} accepted by Resend. Use Refresh tracking for delivery updates.`,
      );
    });
  const syncInbox = () =>
    run(async () => {
      const response = await fetch("/api/mail/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not sync inbox");
      await refresh();
      setNotice("Inbox checked for new messages.");
    });
  const syncSent = () =>
    run(async () => {
      const response = await fetch("/api/mail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "sent" }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not sync sent mail");
      await refresh();
      setNotice("Sent folder checked for new messages.");
    });
  useEffect(() => {
    if (
      tab !== "campaigns" ||
      loadState !== "ready" ||
      !data.connection.connected ||
      demo ||
      sentSyncStarted.current
    )
      return;
    sentSyncStarted.current = true;
    setBusy(true);
    fetch("/api/mail/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: "sent" }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not sync sent mail");
        await refresh();
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not sync sent mail",
        ),
      )
      .finally(() => setBusy(false));
  }, [tab, loadState, data.connection.connected, demo, refresh]);
  useEffect(() => {
    if (
      tab !== "inbox" ||
      loadState !== "ready" ||
      !data.connection.connected ||
      demo
    )
      return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible" || inboxSyncing.current)
        return;
      inboxSyncing.current = true;
      try {
        const response = await fetch("/api/mail/sync", { method: "POST" });
        if (!response.ok) throw new Error("Could not check for new messages");
        if (!stopped) await refresh();
      } catch (cause) {
        if (!stopped)
          setError(
            cause instanceof Error ? cause.message : "Could not check inbox",
          );
      } finally {
        inboxSyncing.current = false;
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 20_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [tab, loadState, data.connection.connected, demo, refresh]);
  const connectMailbox = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run(async () => {
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
      setMailboxPassword("");
      await refresh();
      setNotice(
        `Connected ${result.email}. You can now compose mail and sync your inbox.`,
      );
    });
  };
  const refreshTracking = (id: string) =>
    run(async () => {
      const response = await fetch(`/api/mail/${id}/refresh`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not refresh tracking");
      await refresh();
      setNotice(
        `Checked ${result.checked} message${result.checked === 1 ? "" : "s"} with Resend.`,
      );
    });
  if (!canManageUsers(role))
    return (
      <section className="panel">
        <h2>Owner or Admin access required</h2>
      </section>
    );
  if (loadState === "loading")
    return (
      <section className="panel" role="status" aria-busy="true">
        <h2>Checking email connection…</h2>
        <p>Opening the Mail center.</p>
      </section>
    );
  if (loadState === "error")
    return (
      <section className="panel stack" role="alert">
        <h2>Could not check the email connection</h2>
        <p>{error}</p>
        <button
          type="button"
          className="button"
          onClick={() => {
            setError("");
            setLoadState("loading");
            refresh()
              .then(() => setLoadState("ready"))
              .catch((cause) => {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not load mail",
                );
                setLoadState("error");
              });
          }}
        >
          Try again
        </button>
      </section>
    );
  if (!data.connection.connected)
    return (
      <section className="panel mail-connect stack">
        <div>
          <h2>Connect your email to begin</h2>
          <p>
            Connect your GoDaddy Professional Email mailbox before composing
            mailshots or opening the CRM inbox.
          </p>
        </div>
        <form className="stack mail-settings-form" onSubmit={connectMailbox}>
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
            <input
              required
              type="password"
              autoComplete="current-password"
              value={mailboxPassword}
              onChange={(event) => setMailboxPassword(event.target.value)}
            />
          </label>
          <p className="mail-note">
            Use the password for this email mailbox, not your GoDaddy account
            password. The CRM checks it over secure IMAP and stores it
            encrypted. Your inbox remains in GoDaddy.
          </p>
          <div>
            <button
              className="button primary"
              disabled={busy || demo || !mailboxPassword}
            >
              {busy ? "Connecting…" : "Connect email"}
            </button>
          </div>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {demo && (
          <p className="mail-note">
            Connecting is disabled in the fictional local preview.
          </p>
        )}
      </section>
    );
  return (
    <div className="mail-center stack">
      <div className="mail-tabs" role="tablist" aria-label="Email views">
        <button
          type="button"
          className={tab === "compose" ? "active" : ""}
          onClick={() => setTab("compose")}
        >
          Compose
        </button>
        <button
          type="button"
          className={tab === "campaigns" ? "active" : ""}
          onClick={() => setTab("campaigns")}
        >
          Sent & drafts <span>{data.campaigns.length + data.sent.length}</span>
        </button>
        <button
          type="button"
          className={tab === "inbox" ? "active" : ""}
          onClick={() => setTab("inbox")}
        >
          Inbox <span>{data.inbox.length}</span>
        </button>
        <button
          type="button"
          className="mail-refresh"
          onClick={() => refresh().catch((cause) => setError(String(cause)))}
        >
          Refresh
        </button>
      </div>
      {notice && (
        <p className="mail-success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {demo && (
        <p className="mail-note">
          Sending is disabled in the fictional local preview.
        </p>
      )}
      {tab === "compose" && (
        <section className="panel">
          <div className="mail-heading">
            <div>
              <h2>{draftId ? "Edit draft" : "New mailshot"}</h2>
              <p>
                Choose clients, write your message, then review every recipient
                before sending.
              </p>
            </div>
            {draftId && (
              <button type="button" className="button small" onClick={reset}>
                Start new
              </button>
            )}
          </div>
          <div className="mail-progress">
            <span className={step === "recipients" ? "active" : ""}>
              1 · Recipients
            </span>
            <span className={step === "write" ? "active" : ""}>
              2 · Compose
            </span>
            <span className={step === "review" ? "active" : ""}>
              3 · Review
            </span>
          </div>
          {step === "recipients" && (
            <>
              <div className="mail-heading">
                <h3>Select recipients</h3>
                <strong>{selected.length} selected</strong>
              </div>
              <input
                aria-label="Search clients"
                placeholder="Search clients by name, organisation or email…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="mail-recipient-tools">
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    setSelected((current) =>
                      [
                        ...new Set([
                          ...current,
                          ...filtered.slice(0, 200).map((client) => client.id),
                        ]),
                      ].slice(0, 200),
                    )
                  }
                >
                  Select all filtered
                </button>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setSelected([])}
                >
                  Clear selection
                </button>
                <span>Up to 200 clients per mailshot</span>
              </div>
              <div className="mail-client-list">
                {filtered.map((client) => (
                  <label key={client.id} className="mail-client-row">
                    <input
                      type="checkbox"
                      checked={selected.includes(client.id)}
                      onChange={() => toggle(client.id)}
                      disabled={
                        !selected.includes(client.id) && selected.length >= 200
                      }
                    />
                    <span>
                      <strong>{client.name}</strong>
                      <small>{client.organisation || "Client"}</small>
                    </span>
                    <span className="mail-client-email">{client.email}</span>
                  </label>
                ))}
                {!filtered.length && (
                  <p>No clients with a usable email match this search.</p>
                )}
              </div>
              <div className="form-footer">
                <button
                  type="button"
                  className="button primary"
                  disabled={!selected.length}
                  onClick={() => setStep("write")}
                >
                  Next · Compose ({selected.length})
                </button>
              </div>
            </>
          )}
          {step === "write" && (
            <div className="mail-compose stack">
              <p className="mail-note">
                From{" "}
                {data.settings
                  ? `${data.settings.sender_name} <${data.settings.sender_email}>`
                  : "the sender configured in Settings"}
                . Replies go to{" "}
                {data.settings?.reply_to_email || "the configured mailbox"}. You
                can use <code>{"{{first_name}}"}</code>,{" "}
                <code>{"{{name}}"}</code> and <code>{"{{company}}"}</code>.
              </p>
              <label>
                Subject
                <input
                  value={subject}
                  maxLength={240}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="A new chapter together"
                />
              </label>
              <label>
                Message
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={12}
                  placeholder="Hi {{first_name}},\n\n…"
                />
              </label>
              <div className="mail-preview">
                <strong>
                  Preview for {selectedClients[0]?.name || "client"}
                </strong>
                <p>
                  {subject.replaceAll(
                    "{{first_name}}",
                    selectedClients[0]?.name.split(" ")[0] || "there",
                  )}
                </p>
                <div>
                  {body.replaceAll(
                    "{{first_name}}",
                    selectedClients[0]?.name.split(" ")[0] || "there",
                  )}
                </div>
              </div>
              <div className="form-footer">
                <button
                  type="button"
                  className="button"
                  onClick={() => setStep("recipients")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy || !subject.trim() || !body.trim() || demo}
                  onClick={() =>
                    run(async () => {
                      await saveDraft();
                      setNotice("Draft saved.");
                    })
                  }
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={!subject.trim() || !body.trim()}
                  onClick={() => setStep("review")}
                >
                  Review mailshot
                </button>
              </div>
            </div>
          )}
          {step === "review" && (
            <div className="mail-review stack">
              <h3>Ready to send?</h3>
              <p>
                <strong>{subject}</strong>
              </p>
              <p>
                {selectedClients.length} selected clients · From{" "}
                {data.settings?.sender_email || "unconfigured"} · Replies to{" "}
                {data.settings?.reply_to_email || "unconfigured"}
              </p>
              <div className="mail-review-list">
                {selectedClients.map((client) => (
                  <span key={client.id}>
                    {client.name} &lt;{client.email}&gt;
                  </span>
                ))}
              </div>
              <p className="mail-note">
                This sends a separate email to each client. Delivery and open
                status are reported by Resend after sending; opens are
                approximate.
              </p>
              <div className="form-footer">
                <button
                  type="button"
                  className="button"
                  onClick={() => setStep("write")}
                >
                  Back to message
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy || demo}
                  onClick={() =>
                    run(async () => {
                      await saveDraft();
                      setStep("write");
                      setNotice("Draft saved.");
                    })
                  }
                >
                  Save as draft
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={busy || demo || !data.settings}
                  onClick={send}
                >
                  {busy
                    ? "Sending…"
                    : `Send to ${selectedClients.length} client${selectedClients.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {tab === "campaigns" && (
        <section className="panel">
          <div className="mail-heading">
            <div>
              <h2>Sent & drafts</h2>
              <p>
                Mailshots created here and messages from your connected mailbox.
              </p>
            </div>
            <div className="mail-heading-actions">
              <button
                type="button"
                className="button small"
                disabled={busy || demo}
                onClick={syncSent}
              >
                {busy ? "Checking…" : "Sync sent mail"}
              </button>
              <button type="button" className="button small" onClick={reset}>
                New mailshot
              </button>
            </div>
          </div>
          <div
            className="mail-filters"
            role="group"
            aria-label="Filter sent mail"
          >
            <label className="mail-filter-search">
              <span className="sr-only">Search sent mail</span>
              <input
                type="search"
                placeholder="Search subject, recipient or message…"
                value={sentSearch}
                onChange={(event) => {
                  setSentSearch(event.target.value);
                  setActiveCampaign(null);
                  setActiveSent(null);
                }}
              />
            </label>
            <label>
              <span className="sr-only">Message type</span>
              <select
                value={sentFilter}
                onChange={(event) => {
                  setSentFilter(event.target.value);
                  setActiveCampaign(null);
                  setActiveSent(null);
                }}
              >
                <option value="all">All messages</option>
                <option value="sent">Sent only</option>
                <option value="drafts">Drafts</option>
                <option value="mailshots">CRM mailshots</option>
                <option value="mailbox">Mailbox sent</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Date range</span>
              <select
                value={sentRange}
                onChange={(event) => {
                  setSentRange(event.target.value);
                  setFilterNow(Date.now());
                  setActiveCampaign(null);
                  setActiveSent(null);
                }}
              >
                <option value="all">Any time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </label>
            <span className="mail-filter-count" aria-live="polite">
              {matchingCampaigns.length + matchingSent.length} of{" "}
              {data.campaigns.length + data.sent.length}
            </span>
          </div>
          <div
            className={`mail-split ${campaign || sent ? "has-selection" : ""}`}
          >
            <div
              className="mail-list-pane"
              aria-label="Sent messages and drafts"
            >
              {busy && !data.campaigns.length && !data.sent.length && (
                <p role="status">Checking sent mailbox…</p>
              )}
              {!busy && !data.campaigns.length && !data.sent.length && (
                <p>
                  No sent mail imported yet. Choose Sync sent mail to bring in
                  recent messages from your mailbox, or start a new mailshot.
                </p>
              )}
              {!!(data.campaigns.length || data.sent.length) &&
                !matchingCampaigns.length &&
                !matchingSent.length && <p>No messages match these filters.</p>}
              {!!matchingCampaigns.length && (
                <h3 className="mail-section-label">CRM mailshots & drafts</h3>
              )}
              <div className="mail-campaign-list">
                {matchingCampaigns.map((item) => {
                  const recipients = data.recipients.filter(
                    (recipient) => recipient.campaign_id === item.id,
                  );
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={
                        activeCampaign === item.id
                          ? "mail-campaign-row active"
                          : "mail-campaign-row"
                      }
                      onClick={() => {
                        setActiveCampaign(item.id);
                        setActiveSent(null);
                      }}
                    >
                      <span>
                        <strong>{item.subject}</strong>
                        <small>{formatListDate(item.created_at)}</small>
                      </span>
                      <span className="mail-status">{item.status}</span>
                      <span>{recipients.length} recipients</span>
                    </button>
                  );
                })}
              </div>
              {!!matchingSent.length && (
                <h3 className="mail-section-label">Mailbox sent mail</h3>
              )}
              <div className="mail-campaign-list">
                {matchingSent.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={
                      activeSent === item.id
                        ? "mail-campaign-row active"
                        : "mail-campaign-row"
                    }
                    onClick={() => {
                      setActiveSent(item.id);
                      setActiveCampaign(null);
                    }}
                  >
                    <span>
                      <strong>{item.subject || "(No subject)"}</strong>
                      <small>
                        To {item.to_email || "undisclosed recipients"}
                      </small>
                    </span>
                    <span className="mail-status">Mailbox</span>
                    <span>{formatListDate(item.sent_at)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div
              className="mail-read-pane"
              key={
                campaign
                  ? `campaign:${campaign.id}`
                  : sent
                    ? `sent:${sent.id}`
                    : "empty"
              }
            >
              <button
                type="button"
                className="button small mail-back"
                onClick={() => {
                  setActiveCampaign(null);
                  setActiveSent(null);
                }}
              >
                ← Back to messages
              </button>
              {!campaign && !sent && (
                <div className="mail-read-empty">
                  Select a message to read it.
                </div>
              )}
              {campaign && (
                <div className="mail-detail">
                  <div className="mail-heading">
                    <div>
                      <h3>{campaign.subject}</h3>
                      <p>
                        {campaign.status === "draft"
                          ? "Draft"
                          : `Sent ${campaign.sent_at ? formatDate(campaign.sent_at) : "in progress"}`}{" "}
                        · {campaign.sender_email || data.settings?.sender_email}
                      </p>
                    </div>
                    {campaign.status === "draft" ? (
                      <button
                        type="button"
                        className="button small"
                        onClick={() => edit(campaign)}
                      >
                        Edit draft
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button small"
                        disabled={busy}
                        onClick={() => refreshTracking(campaign.id)}
                      >
                        {busy ? "Checking…" : "Refresh tracking"}
                      </button>
                    )}
                  </div>
                  <div className="mail-message">{campaign.body}</div>
                  <h3>Recipients</h3>
                  <div className="mail-stats">
                    {[
                      "accepted",
                      "delivered",
                      "opened",
                      "bounced",
                      "complained",
                      "failed",
                    ].map((status) => (
                      <span key={status}>
                        <strong>
                          {
                            data.recipients.filter(
                              (recipient) =>
                                recipient.campaign_id === campaign.id &&
                                recipient.status === status,
                            ).length
                          }
                        </strong>
                        {status}
                      </span>
                    ))}
                  </div>
                  <div className="mail-recipient-results">
                    {data.recipients
                      .filter(
                        (recipient) => recipient.campaign_id === campaign.id,
                      )
                      .map((recipient) => (
                        <div key={recipient.id}>
                          <span>
                            <strong>{recipient.name}</strong>
                            <small>{recipient.email}</small>
                          </span>
                          <span
                            className={`mail-status mail-status-${recipient.status}`}
                          >
                            {recipient.status}
                          </span>
                          {recipient.error && (
                            <small title={recipient.error}>
                              Delivery issue
                            </small>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {sent && (
                <div className="mail-detail">
                  <h3>{sent.subject || "(No subject)"}</h3>
                  <div className="mail-message-meta">
                    <div>
                      <strong>{sent.from_email}</strong>
                      <small>
                        To {sent.to_email || "undisclosed recipients"}
                      </small>
                    </div>
                    <time dateTime={sent.sent_at}>
                      {formatDate(sent.sent_at)}
                    </time>
                  </div>
                  <div className="mail-message">{sent.body}</div>
                  <p className="mail-note">
                    Imported read-only from the connected mailbox’s Sent folder.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      {tab === "inbox" && (
        <section className="panel">
          <div className="mail-heading">
            <div>
              <h2>Inbox</h2>
              <p>
                Messages from the connected GoDaddy mailbox appear here
                automatically. They remain in your original mailbox.
              </p>
            </div>
            <button
              type="button"
              className="button small"
              disabled={busy || demo}
              onClick={syncInbox}
            >
              {busy ? "Checking…" : "Sync inbox"}
            </button>
          </div>
          <div className="mail-filters" role="group" aria-label="Filter inbox">
            <label className="mail-filter-search">
              <span className="sr-only">Search inbox</span>
              <input
                type="search"
                placeholder="Search sender, subject or message…"
                value={inboxSearch}
                onChange={(event) => {
                  setInboxSearch(event.target.value);
                  setActiveInbox(null);
                }}
              />
            </label>
            <label>
              <span className="sr-only">Sender type</span>
              <select
                value={inboxFilter}
                onChange={(event) => {
                  setInboxFilter(event.target.value);
                  setActiveInbox(null);
                }}
              >
                <option value="all">All senders</option>
                <option value="clients">Linked clients</option>
                <option value="other">Unlinked senders</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Date range</span>
              <select
                value={inboxRange}
                onChange={(event) => {
                  setInboxRange(event.target.value);
                  setFilterNow(Date.now());
                  setActiveInbox(null);
                }}
              >
                <option value="all">Any time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </label>
            <span className="mail-filter-count" aria-live="polite">
              {matchingInbox.length} of {data.inbox.length}
            </span>
          </div>
          <div className={`mail-split ${inbox ? "has-selection" : ""}`}>
            <div className="mail-list-pane" aria-label="Inbox messages">
              {!data.inbox.length && (
                <p>
                  No messages imported yet. New mail is checked automatically;
                  you can also use Sync inbox now.
                </p>
              )}
              {!!data.inbox.length && !matchingInbox.length && (
                <p>No messages match these filters.</p>
              )}
              <div className="mail-campaign-list">
                {matchingInbox.map((item) => (
                  <button
                    type="button"
                    className={
                      activeInbox === item.id
                        ? "mail-campaign-row active"
                        : "mail-campaign-row"
                    }
                    key={item.id}
                    onClick={() => setActiveInbox(item.id)}
                  >
                    <span>
                      <strong>{item.from_email}</strong>
                      <small>{item.subject || "(No subject)"}</small>
                      <small className="mail-snippet">{item.body}</small>
                    </span>
                    <span>{formatListDate(item.received_at)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mail-read-pane" key={inbox?.id || "empty"}>
              <button
                type="button"
                className="button small mail-back"
                onClick={() => setActiveInbox(null)}
              >
                ← Back to inbox
              </button>
              {!inbox && (
                <div className="mail-read-empty">
                  Select an email to read it.
                </div>
              )}
              {inbox && (
                <div className="mail-detail">
                  <h3>{inbox.subject || "(No subject)"}</h3>
                  <div className="mail-message-meta">
                    <div>
                      <strong>{inbox.from_email}</strong>
                      <small>To {inbox.to_email}</small>
                    </div>
                    <time dateTime={inbox.received_at}>
                      {formatDate(inbox.received_at)}
                    </time>
                  </div>
                  <div className="mail-message">{inbox.body}</div>
                  {inbox.client_id && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        setSelected([inbox.client_id!]);
                        setSubject(`Re: ${inbox.subject}`);
                        setBody("");
                        setDraftId(null);
                        setTab("compose");
                        setStep("write");
                      }}
                    >
                      Reply to client
                    </button>
                  )}
                  {!inbox.client_id && (
                    <p className="mail-note">
                      Add this sender as a client to reply from the CRM.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
