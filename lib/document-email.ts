import type { CommercialDocument } from "./types";
export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function documentEmail(d: CommercialDocument, url: string) {
  const label = d.kind === "quote" ? "quotation" : "invoice";
  const total =
    "INR " +
    Number(d.total).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const subject = `${d.ref} · ${d.title} | The Good Chapter`;
  const text = `Hello ${d.customer.name},\n\nYour ${label} for ${d.title} is ready.\nReference: ${d.ref}\nTotal: ${total}\n\nView and download your document: ${url}\n\nThe Good Chapter\n${d.business.email}`;
  const html = `<div style="background:#f4f1ea;padding:32px;font-family:Arial,sans-serif;color:#0c0b0a"><div style="max-width:560px;margin:auto;background:#fbfaf7;border:1px solid #ded8cc;padding:32px"><p style="font-size:11px;letter-spacing:2px">THE GOOD CHAPTER</p><h1 style="font-family:Georgia,serif;font-weight:400">A good chapter, ready for you.</h1><p>Hello ${escapeHtml(d.customer.name)},</p><p>Your ${label} for <strong>${escapeHtml(d.title)}</strong> is ready.</p><p>${escapeHtml(d.ref)}<br><strong>${escapeHtml(total)}</strong></p><p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;background:#0c0b0a;color:#fff;text-decoration:none">View ${label} &rarr;</a></p><p style="font-size:12px;color:#6e675e">You can download the PDF from this link. Reply to this email if you have any questions.</p></div></div>`;
  return { subject, text, html };
}
