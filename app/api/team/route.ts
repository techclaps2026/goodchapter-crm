import { isSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) throw new Error("Invalid origin");
    const me = await session();
    if (me.role !== "owner") throw new Error("Owner access required");
    if (demoEnabled())
      throw new Error(
        "Invitations are disabled in the fictional local preview",
      );
    const { email, full_name } = z
      .object({ email: z.email(), full_name: z.string().min(1).max(100) })
      .parse(await request.json());
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("Configure the server-only invitation key first");
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invitation failed" },
      { status: 400 },
    );
  }
}
