import { NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";
import { demoEnabled } from "@/lib/demo";
import { canManageUsers } from "@/lib/types";
import { isSameOrigin } from "@/lib/request-origin";
import { encryptToken } from "@/lib/social/providers";
import { bufferOrganizations } from "@/lib/buffer";

const inputSchema = z.object({
  apiKey: z.string().trim().min(8).max(2000),
  organizationId: z.string().max(255).optional(),
});

export async function GET() {
  try {
    await session();
    if (demoEnabled()) return NextResponse.json({ connected: false });
    const db = await createClient();
    const { data, error } = await db.rpc("buffer_config_status");
    if (error) throw error;
    return NextResponse.json({ connected: !!data?.length, organization: data?.[0] ?? null });
  } catch {
    return NextResponse.json({ error: "CRM access required" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const user = await session();
    if (!canManageUsers(user.role) || demoEnabled()) return NextResponse.json({ error: "Owner or Admin access required" }, { status: 403 });
    const input = inputSchema.parse(await request.json());
    const organizations = await bufferOrganizations(input.apiKey);
    if (!organizations.length) throw new Error("No Buffer organizations are available for this key");
    if (!input.organizationId) return NextResponse.json({ organizations });
    const selected = organizations.find((org) => org.id === input.organizationId);
    if (!selected) throw new Error("Choose an organization returned by Buffer");
    const db = await createClient();
    const { error } = await db.rpc("save_buffer_config", {
      p_cipher: encryptToken(input.apiKey, "buffer"),
      p_organization_id: selected.id,
      p_organization_name: selected.name,
    });
    if (error) throw error;
    return NextResponse.json({ connected: true, organization: selected });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not connect Buffer" }, { status: 400 });
  }
}
