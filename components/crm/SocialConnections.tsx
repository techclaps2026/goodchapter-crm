"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageUsers, type Role } from "@/lib/types";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "./shared";

type Platform = "instagram" | "linkedin";
type Connection = {
  platform: Platform;
  account_id: string;
  display_name: string;
  expires_at: string | null;
  granted_scopes: string[];
  connected_at: string;
};
type ConnectionStatus = {
  connections: Connection[];
  configured: Record<Platform, {
    client_id: string;
    requested_scopes: string[];
  } | null>;
};

const platforms: { id: Platform; title: string; description: string }[] = [
  {
    id: "instagram",
    title: "Instagram",
    description: "Authorise The Good Chapter's Professional account",
  },
  {
    id: "linkedin",
    title: "LinkedIn",
    description: "Authorise a Page administrator for future Company Page tools",
  },
];
const subscribeToLocation = () => () => {};

export default function SocialConnections({ role }: { role: Role }) {
  const client = useQueryClient();
  const confirm = useConfirm();
  const [working, setWorking] = useState<Platform | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Platform | null>(null);
  const search = useSyncExternalStore(
    subscribeToLocation,
    () => window.location.search,
    () => "",
  );
  const connectionNotice = new URLSearchParams(search);
  const status = useQuery<ConnectionStatus>({
    queryKey: ["social-connections"],
    queryFn: async () => {
      const response = await fetch("/api/connections/status", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load connections");
      return result;
    },
  });
  const manager = canManageUsers(role);
  return (
    <section className="panel stack" id="integrations">
      <div>
        <h2>Social & communication connections</h2>
        <p style={{ marginTop: 8 }}>
          Add each developer app once, then authorise the business account in
          your browser. The app secret and account tokens are encrypted before
          storage; your Instagram and LinkedIn passwords are never entered here.
        </p>
      </div>
      {connectionNotice?.has("connected") && (
        <p role="status" className="connection-message">
          Account authorised. Available permissions are shown below.
        </p>
      )}
      {connectionNotice?.has("connection_error") && (
        <p role="alert" className="form-error">
          Connection was not completed. Check the developer app, permissions,
          redirect URL and account access, then try again.
        </p>
      )}
      {status.isLoading && <p>Checking connections…</p>}
      {status.error && (
        <p className="form-error" role="alert">
          {status.error.message}
        </p>
      )}
      {platforms.map(({ id, title, description }) => {
        const account = status.data?.connections.find((c) => c.platform === id);
        const configured = status.data?.configured[id] ?? null;
        const expired =
          account?.expires_at &&
          new Date(account.expires_at).getTime() <= status.dataUpdatedAt;
        const needsPublishing =
          id === "instagram"
            ? !account?.granted_scopes.includes("instagram_business_content_publish")
            : !account?.granted_scopes.includes("w_organization_social");
        return (
          <div className="connection-card" key={id}>
            <div className="connection-card-heading">
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <Badge>
                {account ? (expired ? "Reconnect needed" : "Authorised") : "Not connected"}
              </Badge>
            </div>
            {account ? (
              <div className="connection-details">
                <p>
                  <strong>{id === "instagram" ? "@" : ""}{account.display_name}</strong>
                  {account.expires_at && (
                    <> · Token expires {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }).format(new Date(account.expires_at))}</>
                  )}
                </p>
                <p>Permissions requested at authorisation: {account.granted_scopes.join(", ")}</p>
                {needsPublishing && (
                  <p>
                    Publishing permission has not been requested for this connection yet.
                  </p>
                )}
                {id === "linkedin" && (
                  <p>This authorises the Page administrator. Company Page access needs LinkedIn Community Management approval and a separate Page selection step.</p>
                )}
              </div>
            ) : (
              <p className="connection-details">
                {configured
                  ? `Developer app ${configured.client_id} is ready for authorisation.`
                  : "Developer app setup is needed before account authorisation."}
              </p>
            )}
            {manager && (
              <div className="connection-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => setEditing(editing === id ? null : id)}
                >
                  {configured ? "Change app setup" : "Set up developer app"}
                </button>
                {configured && (
                  <a className="button primary" href={`/api/connections/${id}/start`}>
                    {account ? `Reconnect ${title}` : `Connect ${title}`}
                  </a>
                )}
                {account && (
                  <button
                    className="button danger"
                    disabled={working !== null}
                    onClick={async () => {
                      if (!(await confirm({
                        title: `Disconnect ${title}?`,
                        description: "The CRM will lose access to this account. Existing CRM records stay intact.",
                        confirmLabel: "Disconnect",
                        destructive: true,
                      }))) return;
                      setWorking(id);
                      setError("");
                      try {
                        const response = await fetch(`/api/connections/${id}`, {
                          method: "DELETE",
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error || "Could not disconnect");
                        await client.invalidateQueries({ queryKey: ["social-connections"] });
                      } catch (cause) {
                        setError(cause instanceof Error ? cause.message : "Could not disconnect");
                      } finally {
                        setWorking(null);
                      }
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            )}
            {manager && editing === id && (
              <form
                className="connection-config"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  if (account && !(await confirm({
                    title: `Replace ${title} app setup?`,
                    description: "Saving new app credentials disconnects the current account. You can authorise it again afterwards.",
                    confirmLabel: "Replace setup",
                  }))) return;
                  setWorking(id);
                  setError("");
                  try {
                    const response = await fetch("/api/connections/config", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        platform: id,
                        clientId: form.get("clientId"),
                        clientSecret: form.get("clientSecret"),
                        scopes: form.getAll("scope"),
                      }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || "Could not save app setup");
                    setEditing(null);
                    await client.invalidateQueries({ queryKey: ["social-connections"] });
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : "Could not save app setup");
                  } finally {
                    setWorking(null);
                  }
                }}
              >
                <p>
                  Register this exact callback URL in the {title} developer app:
                </p>
                <code>{`${process.env.NEXT_PUBLIC_APP_URL || "https://app.thegoodchapter.in"}/api/connections/${id}/callback`}</code>
                <label>
                  {id === "instagram" ? "Instagram app ID" : "LinkedIn client ID"}
                  <input name="clientId" required defaultValue={configured?.client_id ?? ""} autoComplete="off" />
                </label>
                <label>
                  {id === "instagram" ? "Instagram app secret" : "LinkedIn client secret"}
                  <input name="clientSecret" type="password" required autoComplete="new-password" />
                </label>
                <fieldset>
                  <legend>Permissions to request</legend>
                  {id === "instagram" ? (
                    <>
                      <label className="check"><input type="checkbox" name="scope" value="instagram_business_basic" checked readOnly /> Basic profile</label>
                      <label className="check"><input type="checkbox" name="scope" value="instagram_business_content_publish" defaultChecked={configured?.requested_scopes.includes("instagram_business_content_publish")} /> Content publishing (when approved)</label>
                      <label className="check"><input type="checkbox" name="scope" value="instagram_business_manage_messages" defaultChecked={configured?.requested_scopes.includes("instagram_business_manage_messages")} /> Messages (when approved)</label>
                      <label className="check"><input type="checkbox" name="scope" value="instagram_business_manage_comments" defaultChecked={configured?.requested_scopes.includes("instagram_business_manage_comments")} /> Comments (when approved)</label>
                    </>
                  ) : (
                    <>
                      <label className="check"><input type="checkbox" name="scope" value="openid" checked readOnly /> OpenID identity</label>
                      <label className="check"><input type="checkbox" name="scope" value="profile" checked readOnly /> Profile</label>
                      <label className="check"><input type="checkbox" name="scope" value="w_organization_social" defaultChecked={configured?.requested_scopes.includes("w_organization_social")} /> Company Page posting (Community Management approval)</label>
                      <label className="check"><input type="checkbox" name="scope" value="r_organization_social" defaultChecked={configured?.requested_scopes.includes("r_organization_social")} /> Company Page activity (Community Management approval)</label>
                    </>
                  )}
                </fieldset>
                <p>Only select permissions already available to your developer app. The secret will not be shown again.</p>
                <div className="connection-actions">
                  <button className="button primary" disabled={working !== null}>
                    {working === id ? "Saving…" : "Save app setup"}
                  </button>
                  <a
                    className="text-link"
                    href={id === "instagram" ? "https://developers.facebook.com/apps/" : "https://www.linkedin.com/developers/apps"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open {title} developer portal ↗
                  </a>
                </div>
              </form>
            )}
          </div>
        );
      })}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="connection-card">
        <div className="connection-card-heading">
          <div>
            <strong>WhatsApp Business</strong>
            <p>Customer conversations inside the CRM</p>
          </div>
          <Badge>Later</Badge>
        </div>
      </div>
      <p style={{ fontSize: 12 }}>
        Authorisation connects an account identity. Messaging, post scheduling
        and publishing require their separate platform permissions and CRM
        workflows; none is active yet.
      </p>
    </section>
  );
}
