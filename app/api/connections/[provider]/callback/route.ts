import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { canManageUsers } from "@/lib/types";
import { encryptToken, exchangeCode, isSocialProvider } from "@/lib/social/providers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isSocialProvider(provider))
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const destination = new URL(
    "/settings",
    process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin,
  );
  const finish = (success: boolean) => {
    destination.searchParams.set(
      success ? "connected" : "connection_error",
      provider,
    );
    destination.hash = "integrations";
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(`tgc-oauth-${provider}`, "", {
      path: `/api/connections/${provider}`,
      maxAge: 0,
    });
    return response;
  };
  try {
    const user = await session();
    if (!canManageUsers(user.role) || demoEnabled()) return finish(false);
    const cookie = request.cookies.get(`tgc-oauth-${provider}`)?.value ?? "";
    const [expectedState, expectedUser] = cookie.split(":");
    const suppliedState = request.nextUrl.searchParams.get("state") ?? "";
    if (
      !expectedState ||
      expectedUser !== user.id ||
      suppliedState.length !== expectedState.length ||
      !timingSafeEqual(Buffer.from(suppliedState), Buffer.from(expectedState))
    )
      return finish(false);
    const code = request.nextUrl.searchParams.get("code");
    if (!code || request.nextUrl.searchParams.has("error")) return finish(false);
    const account = await exchangeCode(provider, code);
    const db = await createClient();
    const { error } = await db.rpc("save_social_connection", {
      p_platform: provider,
      p_account_id: account.accountId,
      p_display_name: account.displayName,
      p_access_token_cipher: encryptToken(account.accessToken, provider),
      p_refresh_token_cipher: account.refreshToken
        ? encryptToken(account.refreshToken, provider)
        : null,
      p_expires_at: account.expiresAt,
      p_granted_scopes: account.scopes,
    });
    if (error) throw error;
    return finish(true);
  } catch {
    return finish(false);
  }
}
