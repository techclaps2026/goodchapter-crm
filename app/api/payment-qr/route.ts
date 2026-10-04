import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-origin";
import { session } from "@/lib/server";
import { canManageUsers } from "@/lib/types";
import { demoDb, demoEnabled, demoFiles } from "@/lib/demo";
import { asUser } from "@/scripts/db-harness.mjs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const validPath = /^[0-9a-f-]{36}\.(png|jpg)$/;

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!validPath.test(path)) return new Response("Not found", { status: 404 });
  if (demoEnabled()) {
    const file = demoFiles().get(`payment-qr/${path}`);
    return file
      ? new Response(new Uint8Array(file.bytes), {
          headers: {
            "Content-Type": file.type,
            "Cache-Control": "public, max-age=86400",
          },
        })
      : new Response("Not found", { status: 404 });
  }
  const db = await createClient();
  const { data, error } = await db.storage.from("payment-qr").download(path);
  if (error || !data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await data.arrayBuffer()), {
    headers: {
      "Content-Type": path.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const user = await session();
    if (!canManageUsers(user.role))
      throw new Error("Owner or Admin access required");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 2097152)
      throw new Error("Choose a PNG or JPG payment QR up to 2 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png =
      file.type === "image/png" &&
      bytes.length > 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every(
        (part, index) => bytes[index] === part,
      );
    const jpg =
      file.type === "image/jpeg" &&
      bytes.length > 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255;
    if (!png && !jpg) throw new Error("Choose a valid PNG or JPG payment QR");
    const path = `${crypto.randomUUID()}.${png ? "png" : "jpg"}`;
    if (demoEnabled()) {
      await asUser(await demoDb(), user.id, async (tx) => {
        await tx.query(
          "insert into storage.objects(bucket_id,name) values($1,$2)",
          ["payment-qr", path],
        );
        await tx.query("select save_payment_qr_image($1)", [path]);
      });
      demoFiles().set(`payment-qr/${path}`, {
        bytes,
        type: png ? "image/png" : "image/jpeg",
      });
    } else {
      const db = await createClient();
      const { error: uploadError } = await db.storage
        .from("payment-qr")
        .upload(path, file, {
          contentType: png ? "image/png" : "image/jpeg",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { error: saveError } = await db.rpc("save_payment_qr_image", {
        p_path: path,
      });
      if (saveError) throw saveError;
    }
    return NextResponse.json(
      { path },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not save QR" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const user = await session();
    if (!canManageUsers(user.role))
      throw new Error("Owner or Admin access required");
    if (demoEnabled())
      await asUser(await demoDb(), user.id, (tx) =>
        tx.query("select save_payment_qr_image('')"),
      );
    else {
      const { error } = await (
        await createClient()
      ).rpc("save_payment_qr_image", { p_path: "" });
      if (error) throw error;
    }
    return NextResponse.json(
      { removed: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not remove QR" },
      { status: 400 },
    );
  }
}
