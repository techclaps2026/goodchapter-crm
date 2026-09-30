import { isSameOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { snapshot, mutate } from "@/lib/server";
import { validateMutation } from "@/lib/validation";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
  const message = e instanceof Error ? e.message : "Request failed";
  const status =
    message === "UNAUTHENTICATED"
      ? 401
      : message === "SETUP_REQUIRED"
        ? 503
        : 400;
  return NextResponse.json({ error: message }, { status });
}
export async function GET() {
  try {
    return NextResponse.json(await snapshot(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const { action, payload, key } = validateMutation(await request.json());
    return NextResponse.json(await mutate(action, payload, key));
  } catch (e) {
    return fail(e);
  }
}
