import { isSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { session, mutate } from "@/lib/server";
import { demoEnabled, demoDb, demoFiles } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    await session();
    const form = await request.formData();
    const file = form.get("file");
    const orderId = String(form.get("order_id"));
    const key = String(form.get("key"));
    const xlsxMime =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const xlsxHeader =
      file instanceof File &&
      file.name.toLowerCase().endsWith(".xlsx") &&
      [xlsxMime, "application/octet-stream", ""].includes(file.type)
        ? new Uint8Array(await file.slice(0, 4).arrayBuffer())
        : null;
    const xlsx =
      !!xlsxHeader &&
      xlsxHeader.length === 4 &&
      xlsxHeader[0] === 80 &&
      xlsxHeader[1] === 75 &&
      xlsxHeader[2] === 3 &&
      xlsxHeader[3] === 4;
    const contentType = xlsx ? xlsxMime : file instanceof File ? file.type : "";
    if (
      !/^[0-9a-f-]{36}$/i.test(orderId) ||
      !/^[0-9a-f-]{36}$/i.test(key) ||
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 4194304 ||
      !(
        ["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(
          contentType,
        ) || xlsx
      )
    )
      throw new Error("Choose a PNG, JPG, WebP, PDF or XLSX up to 4 MB");
    const path = `${orderId}/${key}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    if (demoEnabled()) {
      const db = await demoDb();
      await db.query(
        "insert into storage.objects(bucket_id,name) select $1,$2 where not exists(select 1 from storage.objects where bucket_id=$1 and name=$2)",
        ["artwork", path],
      );
      demoFiles().set(path, {
        bytes: new Uint8Array(await file.arrayBuffer()),
        type: contentType,
      });
    } else {
      const db = await createClient();
      const { error } = await db.storage
        .from("artwork")
        .upload(path, file, { contentType, upsert: false });
      if (error && error.message !== "The resource already exists") throw error;
    }
    const result = await mutate(
      "add_artwork",
      {
        order_id: orderId,
        file_name: file.name,
        storage_path: path,
        notes: String(form.get("notes") ?? ""),
      },
      key,
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 },
    );
  }
}
export async function GET(request: Request) {
  try {
    await session();
    const path = new URL(request.url).searchParams.get("path") ?? "";
    if (demoEnabled()) {
      const f = demoFiles().get(path);
      if (!f) return new Response("File not found", { status: 404 });
      return new Response(f.bytes as BodyInit, {
        headers: {
          "Content-Type": f.type,
          "Content-Disposition": "attachment",
          "Cache-Control": "no-store",
        },
      });
    }
    const db = await createClient();
    const { data, error } = await db.storage
      .from("artwork")
      .createSignedUrl(path, 60, { download: true });
    if (error) throw error;
    return NextResponse.redirect(data.signedUrl);
  } catch {
    return new Response("Not available", { status: 403 });
  }
}
