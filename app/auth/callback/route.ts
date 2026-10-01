import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await createClient();
  const code = url.searchParams.get("code"),
    token_hash = url.searchParams.get("token_hash"),
    type = url.searchParams.get("type");
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(type === "recovery" ? "/account/password" : "/", url.origin),
      );
  }
  if (
    token_hash &&
    (type === "email" ||
      type === "invite" ||
      type === "magiclink" ||
      type === "recovery")
  ) {
    const { error } = await db.auth.verifyOtp({ token_hash, type });
    if (!error)
      return NextResponse.redirect(
        new URL(type === "recovery" ? "/account/password" : "/", url.origin),
      );
  }
  return NextResponse.redirect(
    new URL(
      "/login?error=Link+expired.+Request+a+new+sign-in+link.",
      url.origin,
    ),
  );
}
