import type { ParsedMail } from "mailparser";

export const legacyHtmlPlaceholder =
  "[HTML email; open in your original mailbox]";

export function readableMailBody(parsed: Pick<ParsedMail, "text">) {
  return (
    parsed.text?.trim() ||
    "This message contains no readable text. Open it in your original mailbox to view images or attachments."
  ).slice(0, 100000);
}
