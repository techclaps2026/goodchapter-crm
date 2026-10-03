"use client";
import { useEffect, useState } from "react";
import type { BufferOrganization } from "@/lib/buffer";
import { canManageUsers, type Role } from "@/lib/types";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function BufferConnection({ role }: { role: Role }) {
  const [status, setStatus] = useState<{ connected: boolean; organization?: { organization_name: string } } | null>(null);
  const [key, setKey] = useState("");
  const [organizations, setOrganizations] = useState<BufferOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/buffer/config").then((r) => r.json()).then(setStatus).catch(() => setError("Could not load Buffer settings")); }, []);
  const configure = async (save: boolean) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/buffer/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, ...(save ? { organizationId } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Buffer connection failed");
      if (save) {
        setStatus({ connected: true, organization: { organization_name: data.organization.name } });
        setKey(""); setOrganizations([]);
      } else {
        setOrganizations(data.organizations);
        setOrganizationId(data.organizations[0]?.id || "");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Buffer connection failed"); }
    finally { setBusy(false); }
  };
  return <section className="panel" id="buffer">
    <h2>Social publishing · Buffer</h2>
    <p>Connect Buffer once, then create and schedule Instagram and LinkedIn posts from Social Media in this CRM.</p>
    <p style={{ marginTop: 14 }}>{status?.connected ? `Connected to ${status.organization?.organization_name}.` : "Buffer is not connected yet."}</p>
    {canManageUsers(role) && <div className="stack" style={{ marginTop: 20, maxWidth: 620 }}>
      <label>Buffer API key
        <PasswordInput value={key} onChange={(event) => { setKey(event.target.value); setOrganizations([]); }} autoComplete="new-password" placeholder="Paste from Buffer Settings → API" />
      </label>
      <a className="text-link" href="https://publish.buffer.com/settings/api" target="_blank" rel="noreferrer">Open Buffer API settings ↗</a>
      <button type="button" className="button" disabled={busy || key.length < 8} onClick={() => configure(false)}>{busy ? "Checking…" : "Check key and find channels"}</button>
      {organizations.length > 0 && <>
        <label>Buffer organization
          <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        </label>
        <button type="button" className="button primary" disabled={busy || !organizationId} onClick={() => configure(true)}>Connect this organization</button>
      </>}
      <p style={{ fontSize: 12 }}>The key is encrypted on the server. It is never shown again. Replacing it updates this CRM connection.</p>
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
