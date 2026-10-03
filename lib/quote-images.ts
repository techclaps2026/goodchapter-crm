export function quoteImageUrl(path: string, shareToken?: string) {
  const params = new URLSearchParams({ path });
  if (shareToken) params.set("token", shareToken);
  return `/api/quote-image?${params}`;
}
