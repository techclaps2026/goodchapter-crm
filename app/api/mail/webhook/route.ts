import { NextResponse } from "next/server";
import { Resend } from "resend";
import { mailAdmin } from "@/lib/supabase/mail-admin";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const apiKey =
    process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
  if (!secret || !apiKey)
    return NextResponse.json(
      { error: "Mail webhook is not configured" },
      { status: 503 },
    );
  const raw = await request.text();
  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    event = new Resend(apiKey).webhooks.verify({
      payload: raw,
      headers: {
        id: request.headers.get("svix-id") || "",
        timestamp: request.headers.get("svix-timestamp") || "",
        signature: request.headers.get("svix-signature") || "",
      },
      webhookSecret: secret,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 },
    );
  }
  const webhookId = request.headers.get("svix-id")!;
  try {
    const db = mailAdmin();
    if (event.type === "email.received") {
      const [settings, received] = await Promise.all([
        db.from("mail_settings").select("inbound_address").single(),
        new Resend(apiKey).emails.receiving.get(event.data.email_id),
      ]);
      if (settings.error) throw settings.error;
      if (received.error || !received.data)
        throw received.error || new Error("Could not fetch received email");
      const inbound = settings.data?.inbound_address?.toLowerCase();
      if (
        !inbound ||
        !received.data.to.some((to) => to.toLowerCase() === inbound)
      )
        return NextResponse.json({ ok: true });
      const from =
        received.data.from.match(/<([^>]+)>/)?.[1] || received.data.from;
      const fromEmail = from.trim().toLowerCase();
      const client = await db
        .from("clients")
        .select("id")
        .eq("email", fromEmail)
        .limit(1)
        .maybeSingle();
      if (client.error) throw client.error;
      const { error } = await db.from("mail_inbox").upsert(
        {
          resend_id: received.data.id,
          from_email: fromEmail,
          to_email: inbound,
          subject: received.data.subject || "",
          body: (
            received.data.text || "[HTML email; open in your original mailbox]"
          ).slice(0, 100000),
          client_id: client.data?.id || null,
          received_at: received.data.created_at,
        },
        { onConflict: "resend_id", ignoreDuplicates: true },
      );
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (!("email_id" in event.data) || !event.type.startsWith("email."))
      return NextResponse.json({ ok: true });
    const resendId = event.data.email_id;
    const recipient = await db
      .from("mail_recipients")
      .select("id,status,email")
      .eq("resend_id", resendId)
      .maybeSingle();
    if (recipient.error) throw recipient.error;
    const { error: eventError } = await db.from("mail_events").upsert(
      {
        webhook_id: webhookId,
        resend_id: resendId,
        recipient_id: recipient.data?.id || null,
        event_type: event.type,
        occurred_at: event.created_at,
      },
      { onConflict: "webhook_id", ignoreDuplicates: true },
    );
    if (eventError) throw eventError;
    if (!recipient.data) return NextResponse.json({ ok: true });
    const update: Record<string, string> = {};
    if (
      event.type === "email.delivered" &&
      !["opened", "bounced", "complained"].includes(recipient.data.status)
    ) {
      update.status = "delivered";
      update.delivered_at = event.created_at;
    } else if (
      event.type === "email.opened" &&
      !["bounced", "complained"].includes(recipient.data.status)
    ) {
      update.status = "opened";
      update.opened_at = event.created_at;
    } else if (
      event.type === "email.bounced" ||
      event.type === "email.complained" ||
      event.type === "email.suppressed"
    ) {
      update.status =
        event.type === "email.bounced"
          ? "bounced"
          : event.type === "email.complained"
            ? "complained"
            : "failed";
      update.bounced_at = event.created_at;
      const suppression = await db
        .from("mail_opt_outs")
        .upsert({ email: recipient.data.email, source: event.type.slice(6) });
      if (suppression.error) throw suppression.error;
    } else if (
      event.type === "email.failed" &&
      recipient.data.status === "accepted"
    ) {
      update.status = "failed";
    }
    if (Object.keys(update).length) {
      const { error } = await db
        .from("mail_recipients")
        .update(update)
        .eq("id", recipient.data.id);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook failed" },
      { status: 500 },
    );
  }
}
