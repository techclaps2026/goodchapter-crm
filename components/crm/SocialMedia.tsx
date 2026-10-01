/* eslint-disable @next/next/no-img-element -- Buffer returns arbitrary external image URLs. */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { canManageUsers, type Role } from "@/lib/types";
import type { BufferChannel, BufferPost, BufferTag } from "@/lib/buffer";
import { createClient } from "@/lib/supabase/client";

type SocialData = { connected: boolean; organization?: string; channels: BufferChannel[]; posts: BufferPost[]; tags: BufferTag[] };
const mediaTypes: Record<string, { extension: string; kind: "image" | "video"; max: number }> = {
  "image/jpeg": { extension: "jpg", kind: "image", max: 8 * 1024 * 1024 },
  "image/png": { extension: "png", kind: "image", max: 8 * 1024 * 1024 },
  "image/webp": { extension: "webp", kind: "image", max: 8 * 1024 * 1024 },
  "video/mp4": { extension: "mp4", kind: "video", max: 25 * 1024 * 1024 },
};
function publicImageUrl(value?: string) {
  try { return value && new URL(value).protocol === "https:" ? value : null; }
  catch { return null; }
}
export default function SocialMedia({ role, userId, demo }: { role: Role; userId: string; demo: boolean }) {
  const [data, setData] = useState<SocialData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [mediaKind, setMediaKind] = useState<"image" | "video">("image");
  const [postType, setPostType] = useState<"post" | "reel" | "story">("post");
  const [firstComment, setFirstComment] = useState("");
  const [notification, setNotification] = useState(false);
  const [shareToFeed, setShareToFeed] = useState(true);
  const [reminderMusic, setReminderMusic] = useState("");
  const [reminderProducts, setReminderProducts] = useState("");
  const [reminderText, setReminderText] = useState("");
  const [reminderTopics, setReminderTopics] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [createAnother, setCreateAnother] = useState(false);
  const [uploadedName, setUploadedName] = useState("");
  const [uploading, setUploading] = useState(false);
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
  const uploadImage = async (file: File) => {
    setError(""); setUploading(true);
    try {
      const type = mediaTypes[file.type];
      if (!type || !file.size || file.size > type.max) throw new Error("Choose a JPG, PNG or WebP image up to 8 MB, or an MP4 video up to 25 MB");
      if (type.kind === "image") { const bitmap = await createImageBitmap(file); bitmap.close(); }
      const path = `${userId}/${crypto.randomUUID()}.${type.extension}`;
      const storage = createClient().storage.from("social-media");
      const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = storage.getPublicUrl(path);
      if (!publicImageUrl(publicUrl.publicUrl)) throw new Error("Could not create a public image URL");
      setImageUrl(publicUrl.publicUrl); setMediaKind(type.kind);
      setUploadedName(file.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Image upload failed"); }
    finally { setUploading(false); }
  };
  const submit = async (saveToDraft: boolean) => {
    if (mode === "shareNow" && !saveToDraft && !window.confirm("Publish this post now?")) return;
    if (!text.trim() && !imageUrl) { setError("Add a caption or media"); return; }
    if (channel?.service === "instagram" && !imageUrl) { setError("Instagram needs an image or video"); return; }
    if (channel?.service === "instagram" && postType === "post" && mediaKind !== "image") { setError("Feed posts need an image. Choose Reel for a video"); return; }
    if (channel?.service === "instagram" && postType === "reel" && mediaKind !== "video") { setError("Reels need a video"); return; }
    if (!saveToDraft && mode === "customScheduled" && (!dueAt || new Date(dueAt).getTime() <= Date.now() + 60_000)) { setError("Choose a future publishing time"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/buffer/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), channelId, text, mediaUrl: imageUrl, mediaKind,
          postType, firstComment: notification || postType === "story" ? "" : firstComment, notification, shareToFeed, tagIds,
          reminder: notification && channel?.service === "instagram" ? { music: reminderMusic, products: reminderProducts, text: reminderText, topics: postType === "reel" ? reminderTopics : "" } : undefined,
          saveToDraft, mode: saveToDraft ? "addToQueue" : mode,
          ...(!saveToDraft && mode === "customScheduled" ? { dueAt: new Date(dueAt).toISOString() } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit post");
      setText(""); setImageUrl(""); setUploadedName(""); setDueAt(""); setFirstComment(""); setTagIds([]);
      setReminderMusic(""); setReminderProducts(""); setReminderText(""); setReminderTopics("");
      if (!createAnother) setComposerOpen(false);
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
      <section className="panel social-toolbar"><div><h2>Social Media</h2><p>{data.organization} · {data.channels.length} Instagram/LinkedIn channel{data.channels.length === 1 ? "" : "s"}</p>
        <div className="social-channel-list">{data.channels.map((item) => <span className="social-chip" key={item.id}>{item.service === "instagram" ? "Instagram" : "LinkedIn"} · {item.name}</span>)}</div>
        {!data.channels.length && <p>No supported channel is connected. Add one in Buffer, then refresh this page.</p>}</div>
        {canManageUsers(role) && data.channels.length > 0 && <button className="button primary" type="button" onClick={() => setComposerOpen(!composerOpen)}>{composerOpen ? "Close composer" : "+ Create post"}</button>}
      </section>
      {canManageUsers(role) && composerOpen && data.channels.length > 0 && <section className="panel social-composer">
        <div className="social-composer-main stack"><h2>Create post</h2>
          <label>Channel<select value={channelId} onChange={(event) => { setChannelId(event.target.value); setPostType("post"); }}>{data.channels.map((item) => <option key={item.id} value={item.id}>{item.service} · {item.name}</option>)}</select></label>
          {channel?.service === "instagram" && <fieldset className="social-format"><legend>Instagram format</legend>{(["post", "reel", "story"] as const).map((type) => <label key={type}><input type="radio" name="postType" checked={postType === type} onChange={() => setPostType(type)} /> {type[0].toUpperCase() + type.slice(1)}</label>)}</fieldset>}
          <label>Caption<textarea maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} rows={5} placeholder="Write your post…" /></label>
          <div className="social-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadImage(file); }}><ImagePlus size={24} /><strong>Drag and drop media</strong><label className="button small">Choose image or video<input className="social-file-input" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" disabled={uploading || demo} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = ""; }} /></label><small>JPG, PNG, WebP up to 8 MB · MP4 up to 25 MB</small></div>
          {uploading && <p role="status">Uploading media…</p>}
          {imageUrl && <div className="social-image-preview">{mediaKind === "video" ? <video src={imageUrl} controls preload="metadata" /> : <img src={imageUrl} alt={uploadedName || "Selected social media"} />}<span>{uploadedName || "Media from URL"}</span><button type="button" className="button small" onClick={() => { setImageUrl(""); setUploadedName(""); }}>Remove</button></div>}
          <details><summary>Use a public media URL</summary><label>HTTPS URL<input type="url" pattern="https://.*" value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setUploadedName(""); }} placeholder="https://…" /></label><label>Media type<select value={mediaKind} onChange={(event) => setMediaKind(event.target.value as "image" | "video")}><option value="image">Image</option><option value="video">Video</option></select></label></details>
          <p className="social-note">Uploaded media is public so Buffer can fetch it at publishing time. Keep private client artwork out of this composer.</p>
          {postType !== "story" && !notification && <details><summary>First comment · Buffer paid plan</summary><label>First comment<input value={firstComment} maxLength={2200} onChange={(event) => setFirstComment(event.target.value)} placeholder="Add a first comment" /></label><p className="social-note">Your current Buffer free plan rejects first comments. Leave this blank unless the plan changes.</p></details>}
          {!!data.tags?.length && <fieldset className="social-tags"><legend>Tags</legend>{data.tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={tagIds.includes(tag.id)} onChange={(event) => setTagIds(event.target.checked ? [...tagIds, tag.id] : tagIds.filter((id) => id !== tag.id))} />{tag.name}</label>)}</fieldset>}
          <label>Publishing method<select value={notification ? "notification" : "automatic"} onChange={(event) => setNotification(event.target.value === "notification")}><option value="automatic">Automatic · Buffer publishes</option><option value="notification">Reminder · publish manually</option></select></label>
          {channel?.service === "instagram" && postType === "reel" && <label className="social-check"><input type="checkbox" checked={shareToFeed} onChange={(event) => setShareToFeed(event.target.checked)} /> Share Reel to feed</label>}
          {channel?.service === "instagram" && notification && <details><summary>Reminder notes for Instagram</summary><p className="social-note">These are prompts for manual publishing, not automatic stickers, music or product tagging.</p><label>Text or sticker to add<input value={reminderText} maxLength={1000} onChange={(event) => setReminderText(event.target.value)} /></label><label>Music to add<input value={reminderMusic} maxLength={200} onChange={(event) => setReminderMusic(event.target.value)} /></label><label>Products to tag<input value={reminderProducts} maxLength={500} onChange={(event) => setReminderProducts(event.target.value)} /></label>{postType === "reel" && <label>Reel topics<input value={reminderTopics} maxLength={500} onChange={(event) => setReminderTopics(event.target.value)} /></label>}</details>}
          <label>When to publish<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="customScheduled">Set date and time</option><option value="addToQueue">Next queue slot</option><option value="shareNow">Publish now</option></select></label>
          {mode === "customScheduled" && <label>Publish time · your local timezone<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>}
          <div className="social-composer-actions"><label className="social-check"><input type="checkbox" checked={createAnother} onChange={(event) => setCreateAnother(event.target.checked)} /> Create another</label><div><button className="button" type="button" disabled={busy || uploading} onClick={() => void submit(true)}>Save draft</button><button className="button primary" type="button" disabled={busy || uploading || !channelId} onClick={() => void submit(false)}>{busy ? "Submitting…" : mode === "shareNow" ? "Publish now" : mode === "addToQueue" ? "Add to queue" : "Schedule post"}</button></div></div>
        </div><aside className="social-composer-preview"><h3>{channel?.service === "instagram" ? "Instagram" : "LinkedIn"} preview</h3><div className="social-preview-card"><strong>{channel?.name}</strong>{imageUrl ? mediaKind === "video" ? <video src={imageUrl} controls preload="metadata" /> : <img src={imageUrl} alt="Post preview" /> : <div className="social-preview-empty"><ImagePlus size={32} /><span>Your media preview appears here</span></div>}<p>{text || "Your caption appears here…"}</p></div><p className="social-note">Preview is approximate. The final post may look different on the social network.</p></aside>
      </section>}
      <section className="panel"><div className="social-heading"><h2>Posts</h2><button className="button small" onClick={() => load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not refresh posts"))}>Refresh</button></div>
        {!data.posts.length ? <p>No posts found for these channels.</p> : <div className="social-post-list">{data.posts.map((post) => <article key={post.id} className="social-post"><div><strong>{data.channels.find((item) => item.id === post.channelId)?.name || "Channel"}</strong><span>{post.status}{post.dueAt ? ` · ${new Date(post.dueAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` : ""}</span></div>
          {post.assets?.some((asset) => publicImageUrl(asset.thumbnail || asset.source)) && <div className="social-post-images">{post.assets.filter((asset) => publicImageUrl(asset.thumbnail || asset.source)).slice(0, 4).map((asset, index) => asset.mimeType?.startsWith("video/") ? <video key={asset.source || index} src={publicImageUrl(asset.source)!} controls preload="metadata" /> : <img key={asset.source || index} src={publicImageUrl(asset.thumbnail || asset.source)!} alt={`Image ${index + 1} for ${data.channels.find((item) => item.id === post.channelId)?.name || "social post"}`} loading="lazy" />)}</div>}
          {editingId === post.id ? <div className="stack" style={{ marginTop: 12 }}><label>Caption<textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={4} /></label><label>New publish time · leave blank to keep current time<input type="datetime-local" value={editDueAt} onChange={(event) => setEditDueAt(event.target.value)} /></label><div className="row"><button className="button primary small" disabled={busy || !editText.trim()} onClick={() => changePost(post, false)}>Save changes</button><button className="button small" onClick={() => setEditingId(null)}>Cancel</button></div></div> : <p>{post.text}</p>}
          {['scheduled', 'buffer', 'draft'].includes(post.status) && editingId !== post.id && <div className="row" style={{ marginTop: 12 }}><button className="button small" onClick={() => { setEditingId(post.id); setEditText(post.text); setEditDueAt(""); }}>Edit</button><button className="button small danger" disabled={busy} onClick={() => changePost(post, true)}>Delete</button></div>}
        </article>)}</div>}
      </section>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
