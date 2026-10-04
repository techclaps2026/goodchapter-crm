export const QUOTE_ANALYTICS_COOKIE = "tgc-quote-analytics";

export type QuoteAnalyticsConsent = "accepted" | "declined" | "unset";

export function quoteAnalyticsConsent(value: string | undefined): QuoteAnalyticsConsent {
  return value === "accepted" || value === "declined" ? value : "unset";
}

export function deviceCategory(userAgent: string): "mobile" | "tablet" | "desktop" {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return "tablet";
  if (/iPhone|iPod|Android|Mobile/i.test(userAgent)) return "mobile";
  return "desktop";
}

export function browserFamily(userAgent: string): "Edge" | "Firefox" | "Chrome" | "Safari" | "Other" {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Other";
}

export function broadLocation(headers: Headers): { country: string | null; region: string | null } {
  const country = headers.get("x-vercel-ip-country")?.toUpperCase() ?? "";
  const region = headers.get("x-vercel-ip-country-region")?.toUpperCase() ?? "";
  return {
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    region: /^[A-Z0-9]{1,3}$/.test(region) ? region : null,
  };
}
