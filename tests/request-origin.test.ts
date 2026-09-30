import { expect, it } from "vitest";
import { isSameOrigin } from "../lib/request-origin";
it("accepts the real browser authority when Next uses an internal hostname", () => {
  expect(
    isSameOrigin(
      new Request("http://localhost:3100/api/crm", {
        headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" },
      }),
    ),
  ).toBe(true);
});
it("accepts the TLS authority behind the hosting proxy", () => {
  expect(
    isSameOrigin(
      new Request("http://internal:3000/api/crm", {
        headers: {
          host: "crm.example.test",
          origin: "https://crm.example.test",
          "x-forwarded-proto": "https",
        },
      }),
    ),
  ).toBe(true);
});
it("rejects cross-site, missing, null and downgraded origins", () => {
  for (const origin of [
    "https://evil.test",
    "null",
    "",
    "http://crm.example.test",
  ]) {
    expect(
      isSameOrigin(
        new Request("https://crm.example.test/api/crm", {
          headers: { host: "crm.example.test", origin },
        }),
      ),
    ).toBe(false);
  }
});
