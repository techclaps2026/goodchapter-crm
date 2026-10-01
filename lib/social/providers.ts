import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export type SocialProvider = "instagram" | "linkedin";
export const isSocialProvider = (value: string): value is SocialProvider =>
  value === "instagram" || value === "linkedin";

const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
] as const;
const LINKEDIN_SCOPES = [
  "openid",
  "profile",
  "email",
  "w_organization_social",
  "r_organization_social",
] as const;

export function scopesFor(provider: SocialProvider, requested?: string[]) {
  const allowed = provider === "instagram" ? IG_SCOPES : LINKEDIN_SCOPES;
  const fallback = provider === "instagram" ? [IG_SCOPES[0]] : ["openid", "profile"];
  const scopes = requested?.length ? [...requested] : fallback;
  if (scopes.some((scope) => !(allowed as readonly string[]).includes(scope)))
    throw new Error(`Unsupported ${provider} permission configured`);
  if (!scopes.includes(fallback[0])) scopes.unshift(fallback[0]);
  if (provider === "linkedin" && !scopes.includes("profile"))
    scopes.push("profile");
  return [...new Set(scopes)];
}

export async function providerConfig(provider: SocialProvider) {
  const db = await createClient();
  const { data, error } = await db.rpc("social_app_config_secret", {
    p_platform: provider,
  });
  if (error) throw error;
  const saved = data?.[0] as
    | {
        client_id: string;
        client_secret_cipher: string;
        requested_scopes: string[];
      }
    | undefined;
  if (!saved) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("CRM app URL is not configured");
  if (Buffer.from(process.env.SOCIAL_TOKEN_KEY ?? "", "base64").length !== 32)
    throw new Error("Invalid social token encryption key");
  const appUrl = new URL(base);
  if (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost")
    throw new Error("Social connections require an HTTPS app URL");
  const callbackUrl = new URL(`/api/connections/${provider}/callback`, appUrl);
  const scopes = scopesFor(provider, saved.requested_scopes);
  return {
    clientId: saved.client_id,
    clientSecret: decryptToken(saved.client_secret_cipher, provider),
    callbackUrl: callbackUrl.toString(),
    scopes,
  };
}

export async function authorizationUrl(provider: SocialProvider, state: string) {
  const config = await providerConfig(provider);
  if (!config) throw new Error("Developer app credentials are not configured");
  const url = new URL(
    provider === "instagram"
      ? "https://www.instagram.com/oauth/authorize"
      : "https://www.linkedin.com/oauth/v2/authorization",
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    config.scopes.join(provider === "instagram" ? "," : " "),
  );
  if (provider === "instagram") url.searchParams.set("enable_fb_login", "0");
  return url;
}

async function jsonResponse(response: Response) {
  if (!response.ok) throw new Error("The provider did not authorise this connection");
  return (await response.json()) as Record<string, unknown>;
}

export async function exchangeCode(provider: SocialProvider, code: string) {
  const config = await providerConfig(provider);
  if (!config) throw new Error("Developer app credentials are not configured");
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: config.callbackUrl,
    code,
  });
  const instagramForm = new FormData();
  form.forEach((value, key) => instagramForm.set(key, value));
  const response = await fetch(
    provider === "instagram"
      ? "https://api.instagram.com/oauth/access_token"
      : "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      body: provider === "instagram" ? instagramForm : form,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    },
  );
  let token = await jsonResponse(response);
  if (typeof token.access_token !== "string" || !token.access_token)
    throw new Error("The provider returned no access token");

  if (provider === "instagram") {
    const longLived = new URL("https://graph.instagram.com/access_token");
    longLived.searchParams.set("grant_type", "ig_exchange_token");
    longLived.searchParams.set("client_secret", config.clientSecret);
    longLived.searchParams.set("access_token", token.access_token);
    token = await jsonResponse(
      await fetch(longLived, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      }),
    );
    if (typeof token.access_token !== "string" || !token.access_token)
      throw new Error("Instagram returned no long-lived token");
  }

  const profileResponse = await fetch(
    provider === "instagram"
      ? "https://graph.instagram.com/me?fields=id,username,account_type"
      : "https://api.linkedin.com/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    },
  );
  const profile = await jsonResponse(profileResponse);
  const accountId = provider === "instagram" ? profile.id : profile.sub;
  const displayName =
    provider === "instagram" ? profile.username : profile.name;
  if (
    (typeof accountId !== "string" && typeof accountId !== "number") ||
    typeof displayName !== "string" ||
    !displayName
  )
    throw new Error("Could not identify the authorised account");
  const expiresIn = Number(token.expires_in);
  return {
    accountId: String(accountId),
    displayName,
    accessToken: token.access_token,
    refreshToken:
      typeof token.refresh_token === "string" ? token.refresh_token : null,
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null,
    scopes: config.scopes,
  };
}

function encryptionKey() {
  const key = Buffer.from(process.env.SOCIAL_TOKEN_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("Invalid social token encryption key");
  return key;
}

export function encryptToken(token: string, provider: SocialProvider | "buffer") {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(provider));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(value: string, provider: SocialProvider | "buffer") {
  const [version, ivPart, tagPart, bodyPart] = value.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !bodyPart)
    throw new Error("Invalid social token format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAAD(Buffer.from(provider));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
