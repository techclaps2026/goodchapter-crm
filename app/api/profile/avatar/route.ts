import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-origin";
import { demoEnabled } from "@/lib/demo";
import { session } from "@/lib/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bucket = "profile-avatars";
const maxSize = 2 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function isImage(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    );
  if (mime === "image/webp")
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}

function failure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Photo unavailable";
  return NextResponse.json(
    { error: message },
    { status: message === "UNAUTHENTICATED" ? 401 : 400 },
  );
}

export async function GET() {
  try {
    const profile = await session();
    if (demoEnabled() || !profile.avatar_path)
      return new Response("Photo not found", { status: 404 });
    const db = await createClient();
    const { data, error } = await db.storage
      .from(bucket)
      .download(profile.avatar_path);
    if (error || !data) return new Response("Photo not found", { status: 404 });
    const extension = profile.avatar_path.split(".").pop();
    const contentType =
      extension === "jpg"
        ? "image/jpeg"
        : extension === "png"
          ? "image/png"
          : "image/webp";
    return new Response(await data.arrayBuffer(), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Photo unavailable", { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const profile = await session();
    if (demoEnabled()) throw new Error("Photo uploads are unavailable in preview");
    const file = (await request.formData()).get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > maxSize ||
      !extensions[file.type]
    )
      throw new Error("Choose a JPG, PNG or WebP image up to 2 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isImage(bytes, file.type))
      throw new Error("This file is not a valid image");

    const db = await createClient();
    const path =
      profile.id + "/" + crypto.randomUUID() + "." + extensions[file.type];
    const { error: uploadError } = await db.storage
      .from(bucket)
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data: previousPath, error: updateError } = await db.rpc(
      "set_my_avatar",
      { p_storage_path: path },
    );
    if (updateError) {
      await db.storage.from(bucket).remove([path]);
      throw updateError;
    }
    if (previousPath)
      await db.storage.from(bucket).remove([previousPath]);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return failure(cause);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    await session();
    if (demoEnabled()) throw new Error("Photo uploads are unavailable in preview");
    const db = await createClient();
    const { data: previousPath, error } = await db.rpc("set_my_avatar", {
      p_storage_path: "",
    });
    if (error) throw error;
    if (previousPath)
      await db.storage.from(bucket).remove([previousPath]);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return failure(cause);
  }
}
