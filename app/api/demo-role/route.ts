import { isSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { demoEnabled } from "@/lib/demo";
export async function POST(request: Request) {
  if (!demoEnabled()) return new Response("Not found", { status: 404 });
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const { role } = await request.json();
  const response = NextResponse.json({ ok: true });
  response.cookies.set("tgc-demo-role", role === "staff" ? "staff" : "owner", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  return response;
}
