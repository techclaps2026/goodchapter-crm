import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";

const draft = z.object({
  id: z.uuid().nullable().optional(),
  subject: z.string().trim().min(1).max(240),
  body: z.string().min(1).max(50000),
  clientIds: z.array(z.uuid()).min(1).max(200),
});

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
        campaigns: [],
        recipients: [],
        inbox: [],
        demo: true,
      });
    const db = await createClient();
    const [settings, campaigns, recipients, inbox] = await Promise.all([
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
    ]);
    for (const result of [settings, campaigns, recipients, inbox])
      if (result.error) throw result.error;
    return NextResponse.json({
      settings: settings.data,
      campaigns: campaigns.data,
      recipients: recipients.data,
      inbox: inbox.data,
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
    const db = await createClient();
    const { data, error } = await db.rpc("save_mail_campaign", {
      p_id: input.id || null,
      p_subject: input.subject,
      p_body: input.body,
      p_client_ids: [...new Set(input.clientIds)],
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
