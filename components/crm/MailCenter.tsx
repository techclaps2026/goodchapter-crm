"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
type Data = {
  settings: Settings | null;
  campaigns: Campaign[];
  recipients: Recipient[];
  inbox: InboxItem[];
  demo?: boolean;
};
const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
const initial: Data = {
  settings: null,
  campaigns: [],
  recipients: [],
  inbox: [],
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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<string | null>(null);
  const [activeInbox, setActiveInbox] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load mail",
        ),
      );
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
          Sent & drafts <span>{data.campaigns.length}</span>
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
            <h2>Sent & drafts</h2>
            <button type="button" className="button small" onClick={reset}>
              New mailshot
            </button>
          </div>
          {!data.campaigns.length && (
            <p>
              No mailshots yet. Start with one client to check your sender
              address and format.
            </p>
          )}
          <div className="mail-campaign-list">
            {data.campaigns.map((item) => {
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
                  onClick={() => setActiveCampaign(item.id)}
                >
                  <span>
                    <strong>{item.subject}</strong>
                    <small>{formatDate(item.created_at)}</small>
                  </span>
                  <span className="mail-status">{item.status}</span>
                  <span>{recipients.length} recipients</span>
                </button>
              );
            })}
          </div>
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
                  .filter((recipient) => recipient.campaign_id === campaign.id)
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
                        <small title={recipient.error}>Delivery issue</small>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>
      )}
      {tab === "inbox" && (
        <section className="panel">
          <div className="mail-heading">
            <div>
              <h2>Inbox</h2>
              <p>
                Messages from the connected GoDaddy mailbox appear here. They
                remain in your original mailbox.
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
          {!data.inbox.length && (
            <p>
              No messages imported yet. Connect the mailbox in Settings, then
              choose Sync inbox.
            </p>
          )}
          <div className="mail-campaign-list">
            {data.inbox.map((item) => (
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
                  <strong>{item.subject || "(No subject)"}</strong>
                  <small>{item.from_email}</small>
                </span>
                <span>{formatDate(item.received_at)}</span>
              </button>
            ))}
          </div>
          {inbox && (
            <div className="mail-detail">
              <h3>{inbox.subject || "(No subject)"}</h3>
              <p>
                From {inbox.from_email} · To {inbox.to_email} ·{" "}
                {formatDate(inbox.received_at)}
              </p>
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
        </section>
      )}
    </div>
  );
}
