# Resend setup for The Good Chapter

Prepared 1 October 2026. The Resend account has the sending domain
`mail.thegoodchapter.in`, region Tokyo, with receiving disabled. The user
reported the domain was verified after adding the records.

Domain setup: https://resend.com/domains/add/61614659-b1c0-4a01-85bd-9f9a9e4d7db0

## GoDaddy DNS

In the DNS zone for `thegoodchapter.in`, add the following records. These
values were copied from the actual Resend domain screen; use its current
values if the domain is recreated. The DKIM value is a public key, not a secret.

| Type  | Name                     | Value                                                                                                                                                                                                                        | TTL     |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| TXT   | `resend._domainkey.mail` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDz9kp4yD7DxwRv9z5cOTxXJhQkklHoQSFLV12yEHzDRmRA+oBhudM62NlvY5gS5bJ8z9le5T2BX4piuMgmJFuGMaWyVX7cNjwATShMx0nXewDW4Yp/M15cnaR2vBUfivbBpREnPduZ6P8KUjR2RUwrqv2ezoEX2t81soGnbQ5E6wIDAQAB` | Default |
| CNAME | `rsend.mail`             | `rsend-apne1.forge.rmta.net`                                                                                                                                                                                                 | Default |
| CNAME | `send.mail`              | `send.forge.rmta.net`                                                                                                                                                                                                        | Default |

Leave the existing website and mailbox records intact. Then click **I've
already added the records** in Resend and wait for Verified. Check existing
records with these names before adding duplicates. Disable click tracking for
authentication emails so login URLs are not rewritten.

## Sender and credentials

Proposed sender: `The Good Chapter <studio@mail.thegoodchapter.in>`.
Initial CRM owner: `parasnarula71@yahoo.in` (confirmed by the user).
Proposed reply-to: the owner email until a business mailbox is provided.

After verification, create a sending-only Resend key scoped to this domain.
Enter the key directly into Vercel as `RESEND_API_KEY` and Supabase's custom
SMTP password; never commit it or paste it into chat. Prefer separate scoped
keys for the CRM and Auth so each can be rotated independently.

Supabase SMTP: host `smtp.resend.com`, port `465`, username `resend`;
sender name `The Good Chapter`, sender address `studio@mail.thegoodchapter.in`.
Vercel also needs `RESEND_FROM_EMAIL` and `RESEND_REPLY_TO` as above.

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for Auth callbacks and token-hash email
templates. Send the initial owner invitation only after the deployed callback
and SMTP are configured. Test delivery to the owner after explicit approval.

Sources: [Resend Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp),
[Resend sending domains](https://resend.com/docs/dashboard/domains/introduction).
