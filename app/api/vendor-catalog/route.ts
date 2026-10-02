import { NextResponse } from "next/server";
import { session } from "@/lib/server";
import { demoEnabled } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await session();
    if (demoEnabled())
      return new Response("Catalogue unavailable in preview", { status: 404 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id))
      return new Response("Invalid vendor", { status: 400 });
    const db = await createClient();
    const { data: vendor, error } = await db
      .from("vendors")
      .select("catalog_path")
      .eq("id", id)
      .single();
    if (error || !vendor?.catalog_path)
      return new Response("Catalogue not found", { status: 404 });
    const { data, error: linkError } = await db.storage
      .from("vendor-catalogs")
      .createSignedUrl(vendor.catalog_path, 60);
    if (linkError || !data?.signedUrl)
      return new Response("Catalogue unavailable", { status: 404 });
    return NextResponse.redirect(data.signedUrl, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Sign in to view this catalogue", { status: 401 });
  }
}
