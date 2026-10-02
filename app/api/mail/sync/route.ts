import { NextResponse } from "next/server";
import { simpleParser } from "mailparser";
import { session } from "@/lib/server";
import { mailAdmin } from "@/lib/supabase/mail-admin";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";
import { decryptToken } from "@/lib/social/providers";
import { imapClient } from "@/lib/mail-imap";

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
    const db = mailAdmin();
    const { data: credentials, error: credentialError } = await db
      .from("mail_credentials")
      .select("email,password_cipher")
      .eq("id", true)
      .maybeSingle();
    if (credentialError) throw credentialError;
    if (!credentials) throw new Error("Connect a mailbox in Settings first");
    const client = imapClient(
      credentials.email,
      decryptToken(credentials.password_cipher, "mailbox"),
    );
    let imported = 0;
    try {
      await client.connect();
      const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
      if (mailbox.exists) {
        const start = Math.max(1, mailbox.exists - 99);
        const messages = await client.fetchAll(`${start}:*`, {
          uid: true,
          size: true,
          internalDate: true,
        });
        const ids = messages.map(
          (message) =>
            `imap:${credentials.email}:${mailbox.uidValidity}:${message.uid}`,
        );
        const [existing, crmClients] = await Promise.all([
          db.from("mail_inbox").select("resend_id").in("resend_id", ids),
          db.from("clients").select("id,email").eq("archived", false),
        ]);
        if (existing.error) throw existing.error;
        if (crmClients.error) throw crmClients.error;
        const known = new Set(
          (existing.data || []).map((item) => item.resend_id),
        );
        const clientByEmail = new Map(
          (crmClients.data || []).map((item) => [
            item.email.toLowerCase().trim(),
            item.id,
          ]),
        );
        for (const message of messages) {
          const id = `imap:${credentials.email}:${mailbox.uidValidity}:${message.uid}`;
          if (known.has(id) || (message.size || 0) > 1024 * 1024 * 5) continue;
          const full = await client.fetchOne(message.seq, {
            source: true,
            internalDate: true,
          });
          if (!full || !full.source) continue;
          const parsed = await simpleParser(full.source, {
            skipHtmlToText: true,
            skipTextToHtml: true,
          });
          const fromEmail = parsed.from?.value[0]?.address?.toLowerCase();
          if (!fromEmail) continue;
          const { error } = await db.from("mail_inbox").upsert(
            {
              resend_id: id,
              from_email: fromEmail,
              to_email: credentials.email,
              subject: (parsed.subject || "").slice(0, 500),
              body: (
                parsed.text || "[HTML email; open in your original mailbox]"
              ).slice(0, 100000),
              client_id: clientByEmail.get(fromEmail) || null,
              received_at: new Date(
                message.internalDate || parsed.date || Date.now(),
              ).toISOString(),
            },
            { onConflict: "resend_id", ignoreDuplicates: true },
          );
          if (error) throw error;
          imported++;
        }
      }
    } finally {
      if (client.usable) await client.logout().catch(() => client.close());
      else client.close();
    }
    return NextResponse.json({ ok: true, checked: imported });
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
