import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-origin";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { canManageUsers } from "@/lib/types";
import { isSocialProvider } from "@/lib/social/providers";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!isSocialProvider(provider))
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const user = await session();
    if (!canManageUsers(user.role) || demoEnabled())
      return NextResponse.json({ error: "Owner or Admin access required" }, { status: 403 });
    const db = await createClient();
    const { error } = await db.rpc("remove_social_connection", {
      p_platform: provider,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not disconnect" },
      { status: 400 },
    );
  }
}
