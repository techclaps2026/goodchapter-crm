import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-origin";
import { session } from "@/lib/server";
import { hasOwnerAccess } from "@/lib/types";
import { demoDb, demoEnabled, demoFiles } from "@/lib/demo";
import { asUser } from "@/scripts/db-harness.mjs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const bucket = "expense-receipts";
const types = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;
type Extension = keyof typeof types;

// Trust the file's leading bytes, not its name or the browser's MIME guess.
function detect(bytes: Uint8Array): Extension | null {
  const starts = (...signature: number[]) =>
    signature.every((part, index) => bytes[index] === part);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return "png";
  if (starts(255, 216, 255)) return "jpg";
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "webp";
  return null;
}

/** Stores a receipt; the expense save then verifies and attaches the returned path. */
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const user = await session();
    if (!hasOwnerAccess(user.role)) throw new Error("Owner access required");
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > 5242880)
      throw new Error("Choose a PDF, JPG, PNG or WebP receipt up to 5 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = detect(bytes);
    if (!extension)
      throw new Error("Choose a valid PDF, JPG, PNG or WebP receipt");
    const path = `${crypto.randomUUID()}.${extension}`;
    if (demoEnabled()) {
      await (await demoDb()).query(
        "insert into storage.objects(bucket_id,name) values($1,$2)",
        [bucket, path],
      );
      demoFiles().set(`${bucket}/${path}`, { bytes, type: types[extension] });
    } else {
      const { error } = await (await createClient()).storage
        .from(bucket)
        .upload(path, file, { contentType: types[extension], upsert: false });
      if (error) throw error;
    }
    return NextResponse.json(
      { path },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error ? cause.message : "Could not upload receipt",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const user = await session();
    if (!hasOwnerAccess(user.role))
      return new Response("Not available", { status: 403 });
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id))
      return new Response("Invalid receipt", { status: 400 });
    if (demoEnabled()) {
      const path = await asUser(await demoDb(), user.id, async (tx) =>
        (
          await tx.query<{ receipt_path: string }>(
            "select receipt_path from expenses where id=$1",
            [id],
          )
        ).rows[0]?.receipt_path,
      );
      const file = path ? demoFiles().get(`${bucket}/${path}`) : undefined;
      if (!file) return new Response("Receipt not found", { status: 404 });
      return new Response(new Uint8Array(file.bytes), {
        headers: {
          "Content-Type": file.type,
          "Content-Disposition": "inline",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }
    const db = await createClient();
    const { data: expense, error } = await db
      .from("expenses")
      .select("receipt_path")
      .eq("id", id)
      .maybeSingle();
    if (error || !expense?.receipt_path)
      return new Response("Receipt not found", { status: 404 });
    const { data, error: linkError } = await db.storage
      .from(bucket)
      .createSignedUrl(expense.receipt_path, 60);
    if (linkError || !data?.signedUrl)
      return new Response("Receipt unavailable", { status: 404 });
    return NextResponse.redirect(data.signedUrl, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Sign in to view this receipt", { status: 401 });
  }
}
