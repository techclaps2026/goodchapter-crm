import "server-only";
import { simpleParser } from "mailparser";
import { mailAdmin } from "@/lib/supabase/mail-admin";
import { decryptToken } from "@/lib/social/providers";
import { imapClient } from "@/lib/mail-imap";

export async function syncMailbox(folder: "inbox" | "sent") {
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
    const folders = folder === "sent" ? await client.list() : [];
    const sentPath =
      folders.find((entry) => entry.specialUse === "\\Sent" && entry.listed)
        ?.path ||
      folders.find(
        (entry) =>
          entry.listed && /^(sent|sent items|sent mail)$/i.test(entry.name),
      )?.path;
    if (folder === "sent" && !sentPath)
      throw new Error("The connected mailbox has no Sent folder to sync");
    const mailboxPath = folder === "sent" ? sentPath! : "INBOX";
    const mailbox = await client.mailboxOpen(mailboxPath, { readOnly: true });
    if (mailbox.exists) {
      const start = Math.max(1, mailbox.exists - 99);
      const messages = await client.fetchAll(`${start}:*`, {
        uid: true,
        size: true,
        internalDate: true,
      });
      const ids = messages.map((message) =>
        folder === "sent"
          ? `imap:${credentials.email}:${mailboxPath}:${mailbox.uidValidity}:${message.uid}`
          : `imap:${credentials.email}:${mailbox.uidValidity}:${message.uid}`,
      );
      const [existing, crmClients] = await Promise.all([
        folder === "sent"
          ? db.from("mail_sent").select("imap_id").in("imap_id", ids)
          : db.from("mail_inbox").select("resend_id").in("resend_id", ids),
        db.from("clients").select("id,email").eq("archived", false),
      ]);
      if (existing.error) throw existing.error;
      if (crmClients.error) throw crmClients.error;
      const known = new Set(
        (existing.data || []).map((item) =>
          "imap_id" in item ? item.imap_id : item.resend_id,
        ),
      );
      const clientByEmail = new Map(
        (crmClients.data || []).map((item) => [
          item.email.toLowerCase().trim(),
          item.id,
        ]),
      );
      for (const message of messages) {
        const id =
          folder === "sent"
            ? `imap:${credentials.email}:${mailboxPath}:${mailbox.uidValidity}:${message.uid}`
            : `imap:${credentials.email}:${mailbox.uidValidity}:${message.uid}`;
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
        const recipientGroups = parsed.to
          ? Array.isArray(parsed.to)
            ? parsed.to
            : [parsed.to]
          : [];
        const toEmails = recipientGroups
          .flatMap((group) => group.value)
          .map((recipient) => recipient.address?.toLowerCase())
          .filter((address): address is string => !!address);
        const body = (
          parsed.text || "[HTML email; open in your original mailbox]"
        ).slice(0, 100000);
        const sentAt = new Date(
          message.internalDate || parsed.date || Date.now(),
        ).toISOString();
        if (folder === "inbox" && !fromEmail) continue;
        const { error } =
          folder === "sent"
            ? await db.from("mail_sent").upsert(
                {
                  imap_id: id,
                  from_email: fromEmail || credentials.email,
                  to_email: toEmails.join(", ").slice(0, 2000),
                  subject: (parsed.subject || "").slice(0, 500),
                  body,
                  client_id:
                    toEmails
                      .map((email) => clientByEmail.get(email))
                      .find(Boolean) || null,
                  sent_at: sentAt,
                },
                { onConflict: "imap_id", ignoreDuplicates: true },
              )
            : await db.from("mail_inbox").upsert(
                {
                  resend_id: id,
                  from_email: fromEmail!,
                  to_email: credentials.email,
                  subject: (parsed.subject || "").slice(0, 500),
                  body,
                  client_id: clientByEmail.get(fromEmail!) || null,
                  received_at: sentAt,
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
  return imported;
}
