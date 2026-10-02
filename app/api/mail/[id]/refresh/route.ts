import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { session } from "@/lib/server";
import { mailAdmin } from "@/lib/supabase/mail-admin";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const me = await session();
    if (!canManageUsers(me.role) || demoEnabled())
      return NextResponse.json(
        { error: "Owner or Admin access required" },
        { status: 403 },
      );
    const campaignId = z.uuid().parse((await context.params).id);
    const key =
      process.env.RESEND_TRACKING_API_KEY || process.env.RESEND_API_KEY;
    if (!key) throw new Error("Configure a Resend API key first");
    const db = mailAdmin();
    const { data: recipients, error } = await db
      .from("mail_recipients")
      .select("id,resend_id,email,status")
      .eq("campaign_id", campaignId)
      .not("resend_id", "is", null);
    if (error) throw error;
    if (!recipients?.length)
      return NextResponse.json({ checked: 0, updated: 0 });
    const byId = new Map(
      recipients.map((recipient) => [recipient.resend_id, recipient]),
    );
    const resend = new Resend(key);
    let cursor: string | undefined;
    let checked = 0;
    let updated = 0;
    for (let page = 0; page < 10 && byId.size; page++) {
      const response = await resend.emails.list({
        limit: 100,
        ...(cursor ? { after: cursor } : {}),
      });
      if (response.error || !response.data)
        throw new Error(
          response.error?.message ||
            "Could not read delivery status from Resend. This key may need read access.",
        );
      for (const item of response.data.data) {
        const recipient = byId.get(item.id);
        if (!recipient) continue;
        checked++;
        byId.delete(item.id);
        const mapped =
          item.last_event === "clicked"
            ? "opened"
            : ["sent", "queued", "scheduled", "delivery_delayed"].includes(
                  item.last_event,
                )
              ? "accepted"
              : ["suppressed", "canceled"].includes(item.last_event)
                ? "failed"
                : item.last_event;
        const rank: Record<string, number> = {
          pending: 0,
          accepted: 1,
          failed: 2,
          delivered: 3,
          opened: 4,
          bounced: 5,
          complained: 6,
        };
        if (
          !(mapped in rank) ||
          (rank[mapped] <= (rank[recipient.status] || 0) &&
            !["bounced", "complained"].includes(mapped))
        )
          continue;
        const update: Record<string, string> = { status: mapped };
        if (mapped === "delivered")
          update.delivered_at = new Date().toISOString();
        if (mapped === "opened") update.opened_at = new Date().toISOString();
        if (
          mapped === "bounced" ||
          mapped === "complained" ||
          item.last_event === "suppressed"
        ) {
          update.bounced_at = new Date().toISOString();
          const optOut = await db
            .from("mail_opt_outs")
            .upsert({ email: recipient.email, source: item.last_event });
          if (optOut.error) throw optOut.error;
        }
        const saved = await db
          .from("mail_recipients")
          .update(update)
          .eq("id", recipient.id);
        if (saved.error) throw saved.error;
        updated++;
      }
      if (!response.data.has_more || !response.data.data.length) break;
      cursor = response.data.data.at(-1)?.id;
    }
    return NextResponse.json({ checked, updated, remaining: byId.size });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not refresh tracking",
      },
      { status: 400 },
    );
  }
}
