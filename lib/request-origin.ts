/** Compare with the HTTP authority; Next's internal URL may use localhost behind a proxy. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    const supplied = new URL(origin);
    const target = new URL(request.url);
    const host = request.headers.get("host") || target.host;
    const protocol =
      request.headers.get("x-forwarded-proto") || target.protocol.slice(0, -1);
    return (
      (protocol === "http" || protocol === "https") &&
      supplied.origin === `${protocol}://${host}`
    );
  } catch {
    return false;
  }
}
