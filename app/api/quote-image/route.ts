import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-origin";
import { session, sharedDocument } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { demoDb, demoEnabled, demoFiles } from "@/lib/demo";

export const dynamic = "force-dynamic";
const mime: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const validPath = (path: string) =>
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path);
const validImageBytes = (bytes: Uint8Array, type: string) =>
  type === "image/jpeg"
    ? bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : type === "image/png"
      ? bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((part, index) => bytes[index] === part)
      : bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const user = await session();
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024 || !mime[file.type])
      return NextResponse.json({ error: "Choose a JPG, PNG or WebP image up to 4 MB" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validImageBytes(bytes, file.type))
      return NextResponse.json({ error: "The image file does not match its format" }, { status: 400 });
    const path = `${user.id}/${crypto.randomUUID()}.${mime[file.type]}`;
    if (demoEnabled()) {
      const db = await demoDb();
      await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", ["quote-options", path]);
      demoFiles().set(path, { bytes, type: file.type });
    } else {
      const db = await createClient();
      const { error } = await db.storage.from("quote-options").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
    }
    return NextResponse.json({ path });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const path = params.get("path") ?? "";
    if (!validPath(path)) return new Response("Image not found", { status: 404 });
    const token = params.get("token");
    if (token) {
      const doc = await sharedDocument(token);
      const paths = [
        ...(doc?.items ?? []).map((item) => item.image_path),
        ...(doc?.quote_options ?? []).flatMap((group) => group.options.map((option) => option.image_path)),
      ];
      if (!doc || !paths.includes(path)) return new Response("Image not found", { status: 404 });
    } else {
      await session();
    }
    if (demoEnabled()) {
      const file = demoFiles().get(path);
      return file
        ? new Response(file.bytes as BodyInit, { headers: { "Content-Type": file.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
        : new Response("Image not found", { status: 404 });
    }
    const db = token
      ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } })
      : await createClient();
    const { data, error } = await db.storage.from("quote-options").download(path);
    if (error || !data) return new Response("Image not found", { status: 404 });
    return new Response(await data.arrayBuffer(), {
      headers: { "Content-Type": data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Image not found", { status: 404 });
  }
}
