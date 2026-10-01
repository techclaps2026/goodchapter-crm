import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/request-origin";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { canManageUsers } from "@/lib/types";
import { encryptToken, scopesFor } from "@/lib/social/providers";

const configuration = z.object({
  platform: z.enum(["instagram", "linkedin"]),
  clientId: z.string().trim().min(1).max(255),
  clientSecret: z.string().min(4).max(2000),
  scopes: z.array(z.string()).min(1).max(8),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const user = await session();
    if (!canManageUsers(user.role) || demoEnabled())
      return NextResponse.json({ error: "Owner or Admin access required" }, { status: 403 });
    const input = configuration.parse(await request.json());
    const scopes = scopesFor(input.platform, input.scopes);
    const db = await createClient();
    const { error } = await db.rpc("save_social_app_config", {
      p_platform: input.platform,
      p_client_id: input.clientId,
      p_client_secret_cipher: encryptToken(input.clientSecret, input.platform),
      p_requested_scopes: scopes,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save app setup" },
      { status: 400 },
    );
  }
}
