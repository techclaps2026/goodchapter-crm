# Resend setup for The Good Chapter

Prepared 1 October 2026. The user confirmed that the removed
`mail.thegoodchapter.in` domain was replaced by the verified root sending
domain `thegoodchapter.in` in Resend. Public DNS also resolves its DKIM record.

## Domain and DNS

The root domain is already verified. No further DNS entries are required for
this setup. If Resend ever asks for re-verification, use the **current** DNS
values in its dashboard. Do not reuse records for the removed subdomain.
Leave existing website and mailbox records intact. Disable click tracking for
authentication emails so login URLs are not rewritten.

## Sender and credentials

Proposed sender: `The Good Chapter <hello@thegoodchapter.in>`, matching the
CRM's current business-email default.
Initial CRM owner: `parasnarula71@yahoo.in` (confirmed by the user).
Proposed reply-to: the owner email until a business mailbox is provided.

Create a sending-only Resend key scoped to `thegoodchapter.in`.
Enter the key directly into Vercel as `RESEND_API_KEY` and Supabase's custom
SMTP password; never commit it or paste it into chat. Prefer separate scoped
keys for the CRM and Auth so each can be rotated independently.

Supabase SMTP: host `smtp.resend.com`, port `465`, username `resend`;
sender name `The Good Chapter`, sender address `hello@thegoodchapter.in`.
Vercel also needs `RESEND_FROM_EMAIL` and `RESEND_REPLY_TO` as above.

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for Auth callbacks and token-hash email
templates. Send the initial owner invitation only after the deployed callback
and SMTP are configured. Test delivery to the owner after explicit approval.

Sources: [Resend Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp),
[Resend sending domains](https://resend.com/docs/dashboard/domains/introduction).
