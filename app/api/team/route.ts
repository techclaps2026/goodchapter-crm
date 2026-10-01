import { isSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { invitationSchema } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) throw new Error("Invalid origin");
    const me = await session();
    if (!canManageUsers(me.role))
      throw new Error("User management requires Owner or Admin access");
    if (demoEnabled())
      throw new Error(
        "Invitations are disabled in the fictional local preview",
      );
    const { email, full_name, role } = invitationSchema.parse(
      await request.json(),
    );
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("Configure the server-only invitation key first");
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    });
    if (error) throw error;
    if (!data.user?.id)
      throw new Error("Invitation was sent, but no user account was returned");
    const { data: profile, error: roleError } = await db
      .from("profiles")
      .update({ role, full_name, active: true })
      .eq("id", data.user.id)
      .select("id")
      .single();
    if (roleError || !profile)
      throw new Error(
        "Invitation was sent, but its access level could not be saved. Update the teammate in Team access before they sign in.",
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invitation failed" },
      { status: 400 },
    );
  }
}
