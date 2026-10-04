import { describe, expect, it } from "vitest";
import { broadLocation, browserFamily, deviceCategory, quoteAnalyticsConsent } from "../lib/quote-analytics";

describe("quotation analytics inputs", () => {
  it("defaults to no consent for missing or unexpected values", () => {
    expect(quoteAnalyticsConsent(undefined)).toBe("unset");
    expect(quoteAnalyticsConsent("maybe")).toBe("unset");
    expect(quoteAnalyticsConsent("declined")).toBe("declined");
    expect(quoteAnalyticsConsent("accepted")).toBe("accepted");
  });
  it("stores only coarse device and browser categories", () => {
    expect(deviceCategory("Mozilla/5.0 (iPhone) AppleWebKit Safari/605.1")).toBe("mobile");
    expect(deviceCategory("Mozilla/5.0 (iPad) AppleWebKit Safari/605.1")).toBe("tablet");
    expect(deviceCategory("Mozilla/5.0 (Macintosh) Chrome/120.0 Safari/537.36")).toBe("desktop");
    expect(browserFamily("Mozilla/5.0 (Macintosh) Chrome/120.0 Safari/537.36")).toBe("Chrome");
    expect(browserFamily("Mozilla/5.0 Firefox/120.0")).toBe("Firefox");
  });
  it("accepts only broad Vercel country and region codes", () => {
    expect(broadLocation(new Headers({ "x-vercel-ip-country": "in", "x-vercel-ip-country-region": "dl" })))
      .toEqual({ country: "IN", region: "DL" });
    expect(broadLocation(new Headers({ "x-vercel-ip-country": "Delhi", "x-vercel-ip-country-region": "<script>" })))
      .toEqual({ country: null, region: null });
  });
});
