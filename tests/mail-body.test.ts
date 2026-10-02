import { describe, expect, it } from "vitest";
import { simpleParser } from "mailparser";
import { readableMailBody } from "../lib/mail-body";

describe("imported email body", () => {
  it("shows text from an HTML-only email", async () => {
    const parsed = await simpleParser(
      [
        "From: sender@example.test",
        "To: hello@example.test",
        "Subject: HTML only",
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<html><body><h1>Hello</h1><p>Testing Titan's features</p></body></html>",
      ].join("\r\n"),
      { skipTextToHtml: true },
    );
    expect(readableMailBody(parsed).toLowerCase()).toContain(
      "testing titan's features",
    );
    expect(readableMailBody(parsed)).not.toContain(
      "open in your original mailbox",
    );
  });

  it("extracts text from multipart/related HTML mail", async () => {
    const parsed = await simpleParser(
      [
        "From: sender@example.test",
        "To: hello@example.test",
        "Subject: HTML in related content",
        "MIME-Version: 1.0",
        'Content-Type: multipart/related; boundary="related"',
        "",
        "--related",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<html><body><h1>Testing Titan's features</h1><p>Welcome to your mailbox</p></body></html>",
        "--related--",
      ].join("\r\n"),
      { skipTextToHtml: true },
    );
    expect(parsed.text).toBeFalsy();
    expect(readableMailBody(parsed).toLowerCase()).toContain(
      "testing titan's features",
    );
    expect(readableMailBody(parsed)).toContain("Welcome to your mailbox");
  });
});
