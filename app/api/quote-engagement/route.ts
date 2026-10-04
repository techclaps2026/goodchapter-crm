import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-origin";
import { QUOTE_ANALYTICS_COOKIE, broadLocation, browserFamily, deviceCategory } from "@/lib/quote-analytics";
import { session } from "@/lib/server";
import { demoDb, demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { asUser } from "@/scripts/db-harness.mjs";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  token: z.uuid(),
  visitId: z.uuid(),
  visitorId: z.uuid(),
  event: z.enum(["open", "scroll", "pdf_click", "pdf_ready", "option_click", "choices_submit"]),
  optionId: z.uuid().optional(),
  scrollPercent: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]).optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if ((await cookies()).get(QUOTE_ANALYTICS_COOKIE)?.value !== "accepted")
    return NextResponse.json({ error: "Analytics consent required" }, { status: 403 });
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid engagement event" }, { status: 400 });
  const { token, visitId, visitorId, event, optionId, scrollPercent } = parsed.data;
  const userAgent = request.headers.get("user-agent") ?? "";
  const location = broadLocation(request.headers);
  const device = event === "open" ? deviceCategory(userAgent) : null;
  const browser = event === "open" ? browserFamily(userAgent) : null;
  const country = event === "open" ? location.country : null;
  const region = event === "open" ? location.region : null;
  try {
    if (demoEnabled()) {
      await asUser(await demoDb(), null, (db) => db.query(
        "select public.record_quote_share_event($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::smallint,$7::text,$8::text,$9::text,$10::text)",
        [token, visitId, visitorId, event, optionId ?? null, scrollPercent ?? null, device, browser, country, region],
      ));
    } else {
      const db = await createClient();
      const { error } = await db.rpc("record_quote_share_event", {
        p_token: token, p_visit_id: visitId, p_visitor_id: visitorId,
        p_event: event, p_option_id: optionId ?? null, p_scroll_percent: scrollPercent ?? null,
        p_device_category: device, p_browser_family: browser,
        p_country_code: country, p_region_code: region,
      });
      if (error) throw error;
    }
    return NextResponse.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not record engagement" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!z.uuid().safeParse(documentId).success)
    return NextResponse.json({ error: "Invalid quotation" }, { status: 400 });
  try {
    const user = await session();
    let stats: unknown;
    if (demoEnabled()) {
      stats = await asUser(await demoDb(), user.id, async (db) =>
        ((await db.query("select public.quote_share_stats($1::uuid) as stats", [documentId])).rows[0] as { stats: unknown }).stats);
    } else {
      const db = await createClient();
      const { data, error } = await db.rpc("quote_share_stats", { p_document_id: documentId });
      if (error) throw error;
      stats = data;
    }
    return NextResponse.json(stats, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "UNAUTHENTICATED"
      ? "Sign in to see engagement" : "Could not load engagement" },
    { status: error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
