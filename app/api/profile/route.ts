import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-origin";
import { session } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    await session();
    const { full_name } = z
      .object({ full_name: z.string().trim().min(1).max(100) })
      .parse(await request.json());
    const db = await createClient();
    const { error } = await db.rpc("update_my_profile", {
      p_full_name: full_name,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not save";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHENTICATED" ? 401 : 400 },
    );
  }
}
