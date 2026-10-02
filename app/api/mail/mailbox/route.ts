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

type MailboxError = Error & {
  authenticationFailed?: boolean;
  mailboxMissing?: boolean;
  code?: string;
  responseStatus?: string;
  serverResponseCode?: string;
};

function connectionError(error: unknown, stage: "sign-in" | "inbox") {
  const failure = error as MailboxError;
  console.error("GoDaddy mailbox connection failed", {
    stage,
    code: failure.code,
    responseStatus: failure.responseStatus,
    serverResponseCode: failure.serverResponseCode,
    authenticationFailed: failure.authenticationFailed,
  });
  if (
    failure.authenticationFailed ||
    failure.serverResponseCode === "AUTHENTICATIONFAILED"
  )
    return "GoDaddy rejected the sign-in. Use the password for this email mailbox, not your GoDaddy account password, and confirm the address is correct.";
  if (failure.mailboxMissing || stage === "inbox")
    return "GoDaddy accepted the sign-in, but the CRM could not open the inbox. Check that IMAP is available for this mailbox and try again.";
  if (
    [
      "CONNECT_TIMEOUT",
      "GREETING_TIMEOUT",
      "ETIMEOUT",
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ENOTFOUND",
    ].includes(failure.code || "")
  )
    return "The CRM could not reach GoDaddy's IMAP server. Please try again shortly.";
  return "GoDaddy did not complete the mailbox sign-in. Check the email address and mailbox password, then try again.";
}

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
    let stage: "sign-in" | "inbox" = "sign-in";
    try {
      await client.connect();
      stage = "inbox";
      const inbox = await client.mailboxOpen("INBOX", { readOnly: true });
      if (!inbox) throw new Error("INBOX unavailable");
    } catch (error) {
      return NextResponse.json(
        { error: connectionError(error, stage) },
        { status: 400 },
      );
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
