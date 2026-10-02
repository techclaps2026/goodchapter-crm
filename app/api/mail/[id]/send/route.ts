import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { session } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";
import { mailAdmin } from "@/lib/supabase/mail-admin";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";
import { mailHtml, mergeMail } from "@/lib/mail";

export const maxDuration = 300;

type Recipient = {
  id: string;
  name: string;
  organisation: string;
  email: string;
  unsubscribe_token: string;
  status: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let claimed = false;
  let campaignId = "";
  try {
    const me = await session();
    if (!canManageUsers(me.role) || demoEnabled())
      return NextResponse.json(
        { error: "Owner or Admin access required" },
        { status: 403 },
      );
    campaignId = z.uuid().parse((await context.params).id);
    const admin = mailAdmin();
    const { data: credentials, error: credentialError } = await admin
      .from("mail_credentials")
      .select("id")
      .eq("id", true)
      .maybeSingle();
    if (credentialError) throw credentialError;
    if (!credentials)
      return NextResponse.json(
        { error: "Connect your mailbox before sending a mailshot" },
        { status: 409 },
      );
    const apiKey = process.env.RESEND_API_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!apiKey || !baseUrl)
      throw new Error("Configure Resend and the app URL before sending");
    const db = await createClient();
    const { data: claimedData, error: claimError } = await db.rpc(
      "claim_mail_campaign",
      { p_id: campaignId },
    );
    if (claimError) throw claimError;
    if (!claimedData)
      return NextResponse.json(
        { error: "This campaign has already been started or sent" },
        { status: 409 },
      );
    claimed = true;
    const [campaignResult, recipientsResult, settingsResult] =
      await Promise.all([
        admin.from("mail_campaigns").select("*").eq("id", campaignId).single(),
        admin
          .from("mail_recipients")
          .select("*")
          .eq("campaign_id", campaignId)
          .order("email"),
        admin.from("mail_settings").select("*").single(),
      ]);
    for (const result of [campaignResult, recipientsResult, settingsResult])
      if (result.error) throw result.error;
    const campaign = campaignResult.data!;
    const settings = settingsResult.data!;
    const recipients = recipientsResult.data as Recipient[];
    const { error: snapshotError } = await admin
      .from("mail_campaigns")
      .update({
        sender_name: settings.sender_name,
        sender_email: settings.sender_email,
        reply_to_email: settings.reply_to_email,
      })
      .eq("id", campaignId);
    if (snapshotError) throw snapshotError;
    const resend = new Resend(apiKey);
    const from = `${String(settings.sender_name)
      .replace(/[<>\r\n]/g, "")
      .trim()} <${settings.sender_email}>`;
    let accepted = 0;
    let failed = 0;
    for (let offset = 0; offset < recipients.length; offset += 25) {
      const chunk = recipients.slice(offset, offset + 25);
      const payloads = chunk.map((recipient) => {
        const unsubscribeUrl = new URL(
          `/api/mail/unsubscribe/${recipient.unsubscribe_token}`,
          baseUrl,
        ).toString();
        const body = mergeMail(campaign.body, recipient);
        return {
          from,
          to: recipient.email,
          replyTo: settings.reply_to_email,
          subject: mergeMail(campaign.subject, recipient),
          html: mailHtml(
            body,
            mergeMail(settings.signature, recipient),
            unsubscribeUrl,
          ),
          text: `${body}\n\n${mergeMail(settings.signature, recipient)}\n\nUnsubscribe: ${unsubscribeUrl}`,
          headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
          tags: [
            { name: "campaign_id", value: campaignId.replaceAll("-", "") },
          ],
        };
      });
      const result = await resend.batch.send(payloads, {
        idempotencyKey: `tgc-mail/${campaignId}/${offset}`,
      });
      if (
        result.error ||
        !result.data ||
        result.data.data.length !== chunk.length
      ) {
        const reason =
          result.error?.message ||
          "Batch acceptance was not confirmed by Resend";
        for (const recipient of chunk) {
          const { error } = await admin
            .from("mail_recipients")
            .update({ status: "failed", error: reason })
            .eq("id", recipient.id);
          if (error) throw error;
          failed++;
        }
        continue;
      }
      for (let index = 0; index < chunk.length; index++) {
        const recipient = chunk[index];
        const resendId = result.data.data[index].id;
        const { error } = await admin
          .from("mail_recipients")
          .update({ status: "accepted", resend_id: resendId, error: null })
          .eq("id", recipient.id);
        if (error) throw error;
        accepted++;
      }
      // A fast delivery webhook can arrive before its Resend ID is saved above.
      const sentIds = result.data.data.map((item) => item.id);
      const { data: earlyEvents, error: earlyError } = await admin
        .from("mail_events")
        .select("resend_id,event_type,occurred_at")
        .in("resend_id", sentIds);
      if (earlyError) throw earlyError;
      const priority: Record<string, number> = {
        "email.failed": 1,
        "email.suppressed": 1,
        "email.delivered": 2,
        "email.opened": 3,
        "email.bounced": 4,
        "email.complained": 5,
      };
      for (let index = 0; index < chunk.length; index++) {
        const recipient = chunk[index];
        const resendId = sentIds[index];
        const latest = (earlyEvents || [])
          .filter((event) => event.resend_id === resendId)
          .sort(
            (a, b) =>
              (priority[b.event_type] || 0) - (priority[a.event_type] || 0),
          )[0];
        if (!latest || !priority[latest.event_type]) continue;
        const status =
          latest.event_type === "email.suppressed"
            ? "failed"
            : latest.event_type.slice(6);
        const update: Record<string, string> = { status };
        if (status === "delivered") update.delivered_at = latest.occurred_at;
        if (status === "opened") update.opened_at = latest.occurred_at;
        if (
          status === "bounced" ||
          status === "complained" ||
          latest.event_type === "email.suppressed"
        ) {
          update.bounced_at = latest.occurred_at;
          const suppression = await admin.from("mail_opt_outs").upsert({
            email: recipient.email,
            source: latest.event_type.slice(6),
          });
          if (suppression.error) throw suppression.error;
        }
        const { error } = await admin
          .from("mail_recipients")
          .update(update)
          .eq("id", recipient.id)
          .eq("status", "accepted");
        if (error) throw error;
      }
    }
    const status =
      accepted === recipients.length ? "sent" : accepted ? "partial" : "failed";
    const { error: finishError } = await admin
      .from("mail_campaigns")
      .update({ status, sent_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (finishError) throw finishError;
    return NextResponse.json({
      status,
      accepted,
      failed,
      total: recipients.length,
    });
  } catch (error) {
    if (claimed && campaignId) {
      try {
        await mailAdmin()
          .from("mail_campaigns")
          .update({ status: "partial" })
          .eq("id", campaignId)
          .eq("status", "sending");
      } catch {
        /* Preserve the original error. */
      }
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not send mailshot",
      },
      { status: 400 },
    );
  }
}
