import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-origin";
import { demoDb, demoEnabled } from "@/lib/demo";
import { asUser } from "@/scripts/db-harness.mjs";
import { createClient } from "@/lib/supabase/server";

const entry = z.object({
  id: z.uuid(),
  item: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30),
  print_name: z.string().trim().max(80),
  size: z.string().trim().min(1).max(30),
});
const schema = z.object({
  token: z.uuid(),
  version: z.number().int().nonnegative(),
  entries: z.array(entry).max(500),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Complete each name and size before saving" },
      { status: 400 },
    );
  try {
    const { token, entries, version } = parsed.data;
    let result;
    if (demoEnabled()) {
      result = await asUser(
        await demoDb(),
        null,
        async (tx) =>
          (
            await tx.query<{ result: unknown }>(
              "select save_order_sizes($1::uuid,$2::jsonb,$3::integer) as result",
              [token, JSON.stringify(entries), version],
            )
          ).rows[0].result,
      );
    } else {
      const db = await createClient();
      const { data, error } = await db.rpc("save_order_sizes", {
        p_token: token,
        p_entries: entries,
        p_version: version,
      });
      if (error) throw error;
      result = data;
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save sizes",
      },
      { status: 400 },
    );
  }
}
