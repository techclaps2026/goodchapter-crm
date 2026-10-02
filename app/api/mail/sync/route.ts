import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";
import { syncMailbox } from "@/lib/mail-sync";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const me = await session();
    if (!canManageUsers(me.role) || demoEnabled())
      return NextResponse.json(
        { error: "Owner or Admin access required" },
        { status: 403 },
      );
    const input = await request.json().catch(() => ({}));
    const folder = input?.folder === "sent" ? "sent" : "inbox";
    const imported = await syncMailbox(folder);
    return NextResponse.json({ ok: true, folder, checked: imported });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not sync mailbox",
      },
      { status: 400 },
    );
  }
}

// Supabase Cron checks the mailbox when nobody has the CRM open. Its token stays
// in Supabase Vault and is compared only with the existing server-side key.
export async function GET(request: Request) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const received = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!key || !received) return new Response(null, { status: 401 });
  const expected = createHash("sha256")
    .update(`goodchapter-mail-sync:${key}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return new Response(null, { status: 401 });
  try {
    const imported = await syncMailbox("inbox");
    return NextResponse.json({ ok: true, checked: imported });
  } catch (error) {
    console.error("Scheduled inbox sync failed", error);
    return NextResponse.json(
      { error: "Could not sync inbox" },
      { status: 500 },
    );
  }
}
