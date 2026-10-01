import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { authorizationUrl, isSocialProvider } from "@/lib/social/providers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isSocialProvider(provider))
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  try {
    const user = await session();
    if (!canManageUsers(user.role) || demoEnabled())
      return NextResponse.json({ error: "Owner or Admin access required" }, { status: 403 });
    const state = randomBytes(32).toString("base64url");
    const url = await authorizationUrl(provider, state);
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(`tgc-oauth-${provider}`, `${state}:${user.id}`, {
      httpOnly: true,
      secure: url.searchParams.get("redirect_uri")?.startsWith("https://") ?? true,
      sameSite: "lax",
      path: `/api/connections/${provider}`,
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start connection" },
      { status: 503 },
    );
  }
}
