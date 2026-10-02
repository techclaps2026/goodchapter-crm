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
    const params = new URL(request.url).searchParams;
    const catalogId = params.get("catalogId");
    const vendorId = params.get("id");
    const id = catalogId || vendorId;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id))
      return new Response("Invalid catalogue", { status: 400 });
    const db = await createClient();
    const query = db.from("vendor_catalogs").select("storage_path");
    const { data: catalog, error } = await (
      catalogId ? query.eq("id", catalogId) : query.eq("vendor_id", vendorId!)
    )
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !catalog?.storage_path)
      return new Response("Catalogue not found", { status: 404 });
    const { data, error: linkError } = await db.storage
      .from("vendor-catalogs")
      .createSignedUrl(catalog.storage_path, 60);
    if (linkError || !data?.signedUrl)
      return new Response("Catalogue unavailable", { status: 404 });
    return NextResponse.redirect(data.signedUrl, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Sign in to view this catalogue", { status: 401 });
  }
}
