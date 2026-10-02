import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";
import { mailAdmin } from "@/lib/supabase/mail-admin";

const draft = z
  .object({
    id: z.uuid().nullable().optional(),
    subject: z.string().trim().min(1).max(240),
    body: z.string().min(1).max(50000),
    clientIds: z.array(z.uuid()).max(200),
    externalRecipients: z
      .array(
        z.object({
          name: z.string().trim().max(100),
          email: z.email().trim().max(254),
        }),
      )
      .max(200)
      .default([]),
  })
  .refine(
    (value) =>
      value.clientIds.length + value.externalRecipients.length >= 1 &&
      value.clientIds.length + value.externalRecipients.length <= 200,
    { message: "Choose 1 to 200 recipients" },
  );

export async function GET() {
  try {
    const me = await session();
    if (!canManageUsers(me.role))
      return NextResponse.json(
        { error: "Owner or Admin access required" },
        { status: 403 },
      );
    if (demoEnabled())
      return NextResponse.json({
        settings: null,
        connection: { connected: false },
        campaigns: [],
        recipients: [],
        inbox: [],
        sent: [],
        demo: true,
      });
    const db = await createClient();
    const [settings, campaigns, recipients, inbox, sent, credentials] =
      await Promise.all([
        db.from("mail_settings").select("*").single(),
        db
          .from("mail_campaigns")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        db.from("mail_recipients").select("*").limit(5000),
        db
          .from("mail_inbox")
          .select("*")
          .order("received_at", { ascending: false })
          .limit(100),
        db
          .from("mail_sent")
          .select("*")
          .order("sent_at", { ascending: false })
          .limit(100),
        mailAdmin()
          .from("mail_credentials")
          .select("email")
          .eq("id", true)
          .maybeSingle(),
      ]);
    for (const result of [
      settings,
      campaigns,
      recipients,
      inbox,
      sent,
      credentials,
    ])
      if (result.error) throw result.error;
    return NextResponse.json({
      settings: settings.data,
      connection: {
        connected: !!credentials.data,
        email: credentials.data?.email,
      },
      campaigns: campaigns.data,
      recipients: recipients.data,
      inbox: inbox.data,
      sent: sent.data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load mail" },
      { status: 401 },
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
    const input = draft.parse(await request.json());
    const { data: credentials, error: credentialError } = await mailAdmin()
      .from("mail_credentials")
      .select("id")
      .eq("id", true)
      .maybeSingle();
    if (credentialError) throw credentialError;
    if (!credentials)
      return NextResponse.json(
        { error: "Connect your mailbox before creating a mailshot" },
        { status: 409 },
      );
    const db = await createClient();
    const { data, error } = await db.rpc("save_mail_campaign_with_recipients", {
      p_id: input.id || null,
      p_subject: input.subject,
      p_body: input.body,
      p_client_ids: [...new Set(input.clientIds)],
      p_external_recipients: input.externalRecipients.map((recipient) => ({
        name: recipient.name,
        email: recipient.email.toLowerCase(),
      })),
    });
    if (error) throw error;
    return NextResponse.json({ id: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save draft",
      },
      { status: 400 },
    );
  }
}
