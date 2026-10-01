import { isSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { session } from "@/lib/server";
import { canManageUsers } from "@/lib/types";

const body = z.object({ id: z.uuid() });

async function change(request: Request, removed: boolean) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const me = await session();
    if (!canManageUsers(me.role))
      return NextResponse.json(
        { error: "User management requires Owner or Admin access" },
        { status: 403 },
      );
    const { id } = body.parse(await request.json());
    const db = await createClient();
    const { error } = await db.rpc("set_team_user_removed", {
      p_target: id,
      p_removed: removed,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update user" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  return change(request, true);
}

export async function PATCH(request: Request) {
  return change(request, false);
}
