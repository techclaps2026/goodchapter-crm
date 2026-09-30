import { isSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { documentEmail } from "@/lib/document-email";
import type { CommercialDocument } from "@/lib/types";
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request))
      return new Response("Forbidden", { status: 403 });
    const me = await session();
    if (demoEnabled())
      throw new Error(
        "Email sending is disabled in the fictional local preview",
      );
    const { document_id, key } = z
      .object({ document_id: z.uuid(), key: z.uuid() })
      .parse(await request.json());
    const apiKey = process.env.RESEND_API_KEY,
      from = process.env.RESEND_FROM_EMAIL,
      base = process.env.NEXT_PUBLIC_APP_URL;
    if (!apiKey || !from || !base)
      throw new Error("Configure Resend and the app URL before sending emails");
    const db = await createClient();
    const { data, error } = await db
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .single();
    if (error || !data) throw new Error("Document not found");
    const d = data as CommercialDocument;
    if (d.status === "Draft" || !d.share_token)
      throw new Error("Issue the document and enable its share link first");
    const to = z.email().parse(d.customer.email);
    const payload = documentEmail(
      d,
      new URL("/share/" + d.share_token, base).toString(),
    );
    const result = await new Resend(apiKey).emails.send(
      {
        from,
        to,
        replyTo: process.env.RESEND_REPLY_TO || d.business.email || undefined,
        ...payload,
      },
      { idempotencyKey: `document/${me.id}/${document_id}/${key}` },
    );
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({
      id: result.data?.id,
      message:
        "Email accepted by Resend. Check its dashboard for delivery status.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send email" },
      { status: 400 },
    );
  }
}
