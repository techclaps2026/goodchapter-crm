import { NextResponse } from "next/server";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await session();
    if (demoEnabled())
      return NextResponse.json({
        connections: [],
        configured: { instagram: false, linkedin: false },
      });
    const db = await createClient();
    const [connections, apps] = await Promise.all([
      db.rpc("social_connection_status"),
      db.rpc("social_app_config_status"),
    ]);
    if (connections.error) throw connections.error;
    if (apps.error) throw apps.error;
    const configured = apps.data as { platform: string; client_id: string; requested_scopes: string[] }[];
    return NextResponse.json(
      {
        connections: connections.data,
        configured: Object.fromEntries(
          ["instagram", "linkedin"].map((platform) => [
            platform,
            configured.find((app) => app.platform === platform) ?? null,
          ]),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load connections" },
      { status: 401 },
    );
  }
}
