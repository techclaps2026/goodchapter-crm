import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/server";
import { mailAdmin } from "@/lib/supabase/mail-admin";
import { createClient } from "@/lib/supabase/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";
import { encryptToken } from "@/lib/social/providers";
import { imapClient } from "@/lib/mail-imap";

export const maxDuration = 45;

export async function GET() {
  try {
    const me = await session();
    if (!canManageUsers(me.role))
      return NextResponse.json(
        { error: "Owner or Admin access required" },
        { status: 403 },
      );
    if (demoEnabled()) return NextResponse.json({ connected: false });
    const { data, error } = await mailAdmin()
      .from("mail_credentials")
      .select("email,updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      connected: !!data,
      email: data?.email,
      updatedAt: data?.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load mailbox",
      },
      { status: 400 },
    );
  }
}

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
    const input = z
      .object({ email: z.email(), password: z.string().min(1).max(1000) })
      .parse(await request.json());
    const client = imapClient(input.email, input.password);
    try {
      await client.connect();
      await client.mailboxOpen("INBOX", { readOnly: true });
    } finally {
      if (client.usable) await client.logout().catch(() => client.close());
      else client.close();
    }
    const db = await createClient();
    const { error } = await db.rpc("save_mail_credentials", {
      p_email: input.email,
      p_cipher: encryptToken(input.password, "mailbox"),
    });
    if (error) throw error;
    return NextResponse.json({ connected: true, email: input.email });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not connect mailbox",
      },
      { status: 400 },
    );
  }
}
