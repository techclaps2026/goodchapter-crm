export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] || character,
  );
}

export function mergeMail(
  value: string,
  recipient: { name: string; organisation: string },
): string {
  const firstName = recipient.name.trim().split(/\s+/)[0] || "there";
  return value.replace(
    /{{\s*(first_name|name|company)\s*}}/gi,
    (_, key: string) =>
      key.toLowerCase() === "first_name"
        ? firstName
        : key.toLowerCase() === "name"
          ? recipient.name
          : recipient.organisation,
  );
}

export function mailHtml(
  body: string,
  signature: string,
  unsubscribeUrl: string,
): string {
  const paragraphs = (text: string) =>
    text
      .split(/\n\s*\n/)
      .map(
        (part) =>
          `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`,
      )
      .join("");
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#211d1a;background:#f5f1eb;padding:24px"><div style="max-width:640px;margin:auto;background:#fff;padding:32px">${paragraphs(body)}${signature ? `<div style="margin-top:28px;color:#665b51">${paragraphs(signature)}</div>` : ""}<hr style="border:0;border-top:1px solid #e6ddd2;margin:32px 0 16px"><p style="font-size:12px;color:#776e66">The Good Chapter · <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from mailshots</a></p></div></body></html>`;
}
