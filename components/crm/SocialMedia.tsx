"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { canManageUsers, type Role } from "@/lib/types";
import type { BufferChannel, BufferPost } from "@/lib/buffer";

type SocialData = { connected: boolean; organization?: string; channels: BufferChannel[]; posts: BufferPost[] };
export default function SocialMedia({ role }: { role: Role }) {
  const [data, setData] = useState<SocialData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [mode, setMode] = useState<"addToQueue" | "customScheduled" | "shareNow">("customScheduled");
  const [dueAt, setDueAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const load = async () => {
    const response = await fetch("/api/buffer", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load posts");
    setData(result);
    setChannelId((previous) => previous || result.channels[0]?.id || "");
  };
  useEffect(() => {
    fetch("/api/buffer", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load posts");
        setData(result);
        setChannelId(result.channels[0]?.id || "");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load posts"));
  }, []);
  const channel = data?.channels.find((item) => item.id === channelId);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "shareNow" && !window.confirm("Publish this post now?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/buffer/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), channelId, text, imageUrl, mode, ...(mode === "customScheduled" ? { dueAt: new Date(dueAt).toISOString() } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit post");
      setText(""); setImageUrl(""); setDueAt("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit post"); }
    finally { setBusy(false); }
  };
  const changePost = async (post: BufferPost, remove: boolean) => {
    if (remove && !window.confirm("Delete this scheduled post from Buffer?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/buffer/posts/${encodeURIComponent(post.id)}`, {
        method: remove ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(remove ? {} : { body: JSON.stringify({ text: editText, ...(editDueAt ? { dueAt: new Date(editDueAt).toISOString() } : {}) }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not change post");
      setEditingId(null); setEditDueAt("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change post"); }
    finally { setBusy(false); }
  };
  if (!data && !error) return <div className="panel">Loading connected channels…</div>;
  return <div className="stack">
    {!data?.connected && <section className="panel"><h2>Connect your social channels</h2><p>Connect Instagram or LinkedIn in Buffer, then add your Buffer API key in CRM settings.</p><Link className="button primary" href="/settings#buffer">Connection settings →</Link></section>}
    {data?.connected && <>
      <section className="panel"><h2>Connected channels</h2><p>{data.organization} · {data.channels.length} Instagram/LinkedIn channel{data.channels.length === 1 ? "" : "s"}</p>
        <div className="social-channel-list">{data.channels.map((item) => <span className="social-chip" key={item.id}>{item.service === "instagram" ? "Instagram" : "LinkedIn"} · {item.name}</span>)}</div>
        {!data.channels.length && <p>No supported channel is connected. Add one in Buffer, then refresh this page.</p>}
      </section>
      {canManageUsers(role) && data.channels.length > 0 && <form className="panel stack" onSubmit={submit}>
        <h2>Create post</h2>
        <label>Channel<select value={channelId} onChange={(event) => setChannelId(event.target.value)}>{data.channels.map((item) => <option key={item.id} value={item.id}>{item.service} · {item.name}</option>)}</select></label>
        <label>Caption<textarea required maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} rows={5} placeholder="Write your post…" /></label>
        <label>Public image URL {channel?.service === "instagram" ? "· required for Instagram" : "· optional"}<input type="url" pattern="https://.*" required={channel?.service === "instagram"} value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" /></label>
        <p style={{ fontSize: 12 }}>Use a public HTTPS image that remains available until publishing. Private CRM artwork is never shared with Buffer.</p>
        <label>When to publish<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="customScheduled">Schedule for a specific time</option><option value="addToQueue">Add to Buffer queue</option><option value="shareNow">Publish now</option></select></label>
        {mode === "customScheduled" && <label>Publish time · your local timezone<input type="datetime-local" required value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>}
        <button className="button primary" disabled={busy || !channelId}>{busy ? "Submitting…" : mode === "shareNow" ? "Publish now" : "Schedule post"}</button>
      </form>}
      <section className="panel"><div className="social-heading"><h2>Posts</h2><button className="button small" onClick={() => load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not refresh posts"))}>Refresh</button></div>
        {!data.posts.length ? <p>No posts found for these channels.</p> : <div className="social-post-list">{data.posts.map((post) => <article key={post.id} className="social-post"><div><strong>{data.channels.find((item) => item.id === post.channelId)?.name || "Channel"}</strong><span>{post.status}{post.dueAt ? ` · ${new Date(post.dueAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` : ""}</span></div>
          {editingId === post.id ? <div className="stack" style={{ marginTop: 12 }}><label>Caption<textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={4} /></label><label>New publish time · leave blank to keep current time<input type="datetime-local" value={editDueAt} onChange={(event) => setEditDueAt(event.target.value)} /></label><div className="row"><button className="button primary small" disabled={busy || !editText.trim()} onClick={() => changePost(post, false)}>Save changes</button><button className="button small" onClick={() => setEditingId(null)}>Cancel</button></div></div> : <p>{post.text}</p>}
          {['scheduled', 'draft'].includes(post.status) && editingId !== post.id && <div className="row" style={{ marginTop: 12 }}><button className="button small" onClick={() => { setEditingId(post.id); setEditText(post.text); setEditDueAt(""); }}>Edit</button><button className="button small danger" disabled={busy} onClick={() => changePost(post, true)}>Delete</button></div>}
        </article>)}</div>}
      </section>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
