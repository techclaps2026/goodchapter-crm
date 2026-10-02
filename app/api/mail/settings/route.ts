import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";

const schema = z.object({
  senderName: z.string().trim().min(1).max(100),
  senderEmail: z.email().max(254),
  replyToEmail: z.email().max(254),
  inboundAddress: z.union([z.literal(""), z.email()]),
  signature: z.string().max(2000),
});

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
    const input = schema.parse(await request.json());
    const db = await createClient();
    const { error } = await db.rpc("save_mail_settings", {
      p_sender_name: input.senderName,
      p_sender_email: input.senderEmail,
      p_reply_to_email: input.replyToEmail,
      p_inbound_address: input.inboundAddress,
      p_signature: input.signature,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save email settings",
      },
      { status: 400 },
    );
  }
}
