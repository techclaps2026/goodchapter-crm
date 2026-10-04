import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/server", () => ({ session: vi.fn() }));
vi.mock("@/lib/demo", () => ({ demoDb: vi.fn(), demoEnabled: () => false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/scripts/db-harness.mjs", () => ({ asUser: vi.fn() }));

import { POST as saveConsent } from "../app/api/quote-consent/route";
import { POST as recordEngagement } from "../app/api/quote-engagement/route";

function request(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("shared quotation analytics consent", () => {
  it("saves an explicit choice in an HTTP-only preference cookie", async () => {
    const response = await saveConsent(request("/api/quote-consent", { consent: "accepted" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("tgc-quote-analytics=accepted");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });
  it("refuses engagement events before consent", async () => {
    const response = await recordEngagement(request("/api/quote-engagement", {
      token: crypto.randomUUID(), visitId: crypto.randomUUID(), visitorId: crypto.randomUUID(), event: "open",
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Analytics consent required" });
  });
});
