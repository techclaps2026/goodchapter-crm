import type { ParsedMail } from "mailparser";
import { htmlToText } from "html-to-text";

export const legacyHtmlPlaceholder =
  "[HTML email; open in your original mailbox]";
export const legacyUnreadableFallback =
  "This message contains no readable text. Open it in your original mailbox to view images or attachments.";

export function readableMailBody(parsed: Pick<ParsedMail, "text" | "html">) {
  const html =
    typeof parsed.html === "string"
      ? htmlToText(parsed.html, { wordwrap: false }).trim()
      : "";
  return (
    parsed.text?.trim() ||
    html ||
    "This email contains no text. View images or attachments in your original mailbox."
  ).slice(0, 100000);
}
