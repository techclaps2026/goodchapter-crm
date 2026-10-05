/* eslint-disable @next/next/no-img-element -- Authenticated profile images use a private API route. */
"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [saved, setSaved] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const avatarSrc = s.profile.avatar_path
    ? "/api/profile/avatar?v=" + encodeURIComponent(s.profile.avatar_path)
    : null;

  const changePhoto = async (file?: File) => {
    if (!file && !s.profile.avatar_path) return;
    setPhotoError("");
    setPhotoSaved(false);
    setPhotoBusy(true);
    try {
      const body = new FormData();
      if (file) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          !file.size ||
          file.size > 2 * 1024 * 1024
        )
          throw new Error("Choose a JPG, PNG or WebP image up to 2 MB");
        body.append("file", file);
      }
      const response = await fetch("/api/profile/avatar", {
        method: file ? "POST" : "DELETE",
        ...(file ? { body } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update photo");
      await refresh();
      setPhotoSaved(true);
    } catch (cause) {
      setPhotoError(
        cause instanceof Error ? cause.message : "Could not update photo",
      );
    } finally {
      setPhotoBusy(false);
    }
  };

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
        <div>
          <strong>Profile photo</strong>
          <div className="profile-photo-row" style={{ marginTop: 12 }}>
            <span className="profile-photo-preview">
              {avatarSrc ? (
                <img src={avatarSrc} alt="Your profile photo" />
              ) : (
                s.profile.full_name.slice(0, 1) || "G"
              )}
            </span>
            <div>
              <div className="profile-photo-actions">
                <button
                  className="button"
                  type="button"
                  disabled={photoBusy || s.demo}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {photoBusy
                    ? "Uploading…"
                    : avatarSrc
                      ? "Change photo"
                      : "Upload photo"}
                </button>
                <input
                  ref={photoInputRef}
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={photoBusy || s.demo}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void changePhoto(file);
                    event.target.value = "";
                  }}
                />
                {avatarSrc && (
                  <button
                    className="button"
                    type="button"
                    disabled={photoBusy || s.demo}
                    onClick={() => void changePhoto()}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="profile-photo-help">
                JPG, PNG or WebP · up to 2 MB. Visible only when signed in.
              </p>
            </div>
          </div>
          {photoError && (
            <p className="form-error" role="alert">
              {photoError}
            </p>
          )}
          {photoSaved && <p role="status">Photo updated.</p>}
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
              Set or change password <ArrowRight className="inline-arrow" aria-hidden="true" />
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
              Manage users and roles <ArrowRight className="inline-arrow" aria-hidden="true" />
            </Link>
          )}
        </section>
        {s.profile.role !== "staff" && (
          <section className="panel stack">
            <h2>Integrations</h2>
            <p>
              Facebook, Instagram and LinkedIn content · WhatsApp customer
              conversations
            </p>
            <Link className="text-link" href="/settings#integrations">
              View social & communication connections <ArrowRight className="inline-arrow" aria-hidden="true" />
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
