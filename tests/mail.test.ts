import { describe, expect, it } from "vitest";
import { mailHtml, mergeMail } from "../lib/mail";

describe("mailshot rendering", () => {
  it("personalizes known fields without exposing HTML in the message or signature", () => {
    const recipient = {
      name: "Meera Shah",
      organisation: "Northstar <script>",
    };
    const content = mergeMail(
      "Hi {{first_name}}, welcome to {{company}}",
      recipient,
    );
    expect(content).toContain("Hi Meera");
    const html = mailHtml(
      content,
      "<img src=x onerror=alert(1)>",
      "https://app.thegoodchapter.in/unsubscribe",
    );
    expect(html).toContain("Northstar &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Unsubscribe from mailshots");
  });
});
