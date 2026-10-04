import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-origin";
import { session } from "@/lib/server";
import { demoDb, demoEnabled } from "@/lib/demo";
import { asUser } from "@/scripts/db-harness.mjs";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  orderId: z.uuid(),
  items: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  enabled: z.boolean(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const user = await session();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Add 1 to 12 distinct item names" },
        { status: 400 },
      );
    const { orderId, items, enabled } = parsed.data;
    let form;
    if (demoEnabled()) {
      form = await asUser(
        await demoDb(),
        user.id,
        async (tx) =>
          (
            await tx.query<{ form: unknown }>(
              "select configure_order_sizes($1,$2::text[],$3) as form",
              [orderId, items, enabled],
            )
          ).rows[0].form,
      );
    } else {
      const db = await createClient();
      const { data, error } = await db.rpc("configure_order_sizes", {
        p_order_id: orderId,
        p_items: items,
        p_enabled: enabled,
      });
      if (error) throw error;
      form = data;
    }
    return NextResponse.json(form, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save size form",
      },
      { status: 400 },
    );
  }
}
