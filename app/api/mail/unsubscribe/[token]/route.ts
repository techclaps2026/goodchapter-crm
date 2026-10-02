import { z } from "zod";
import { mailAdmin } from "@/lib/supabase/mail-admin";
import { escapeHtml } from "@/lib/mail";

async function recipientFor(token: string) {
  if (!z.uuid().safeParse(token).success) return null;
  const db = mailAdmin();
  const { data, error } = await db
    .from("mail_recipients")
    .select("email")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function page(message: string, action = "") {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Email preferences · The Good Chapter</title></head><body style="font:16px Arial,sans-serif;background:#f5f1eb;color:#211d1a;padding:32px"><main style="max-width:500px;margin:10vh auto;background:white;padding:32px"><h1>Email preferences</h1><p>${escapeHtml(message)}</p>${action}</main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const token = (await context.params).token;
  const recipient = await recipientFor(token);
  if (!recipient) return page("This link is invalid or has expired.");
  return page(
    `Stop mailshots to ${recipient.email}?`,
    `<form method="post"><button style="background:#211d1a;color:white;border:0;padding:12px 18px;cursor:pointer">Unsubscribe</button></form>`,
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const token = (await context.params).token;
  const recipient = await recipientFor(token);
  if (!recipient) return page("This link is invalid or has expired.");
  const { error } = await mailAdmin()
    .from("mail_opt_outs")
    .upsert({ email: recipient.email, source: "unsubscribe" });
  if (error) return page("Could not save your preference. Please try again.");
  return page(`${recipient.email} has been removed from future mailshots.`);
}
