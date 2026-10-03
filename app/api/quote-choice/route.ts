import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-origin";
import { demoDb, demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  token: z.uuid(),
  choices: z.record(z.uuid(), z.uuid()),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Choose one option from each group" }, { status: 400 });
  try {
    const { token, choices } = parsed.data;
    if (demoEnabled()) {
      await (await demoDb()).query("select public.select_quote_options($1::uuid,$2::jsonb)", [token, JSON.stringify(choices)]);
    } else {
      const db = await createClient();
      const { error } = await db.rpc("select_quote_options", { token, choices });
      if (error) throw error;
    }
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save choices" }, { status: 400 });
  }
}
