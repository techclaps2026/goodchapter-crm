import { NextResponse } from "next/server";
import { z } from "zod";
import { QUOTE_ANALYTICS_COOKIE } from "@/lib/quote-analytics";
import { isSameOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = z.object({ consent: z.enum(["accepted", "declined"]) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid choice" }, { status: 400 });
  const response = NextResponse.json({ consent: parsed.data.consent },
    { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(QUOTE_ANALYTICS_COOKIE, parsed.data.consent, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 180 * 24 * 60 * 60,
  });
  return response;
}
