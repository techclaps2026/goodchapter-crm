# Current checkpoint — 1 October 2026

The independent CRM is in the private repository
https://github.com/techclaps2026/goodchapter-crm. Tripclaps and BML were
refreshed before implementation; provenance is in [SOURCE.md](../SOURCE.md).
The first release covers leads, clients, follow-ups, products, vendors,
quotations, orders, artwork approval, invoices, payments and reports.

## Live services

- Production URL: https://app.thegoodchapter.in. GoDaddy's `app` CNAME and
  `_vercel` TXT records verified ownership; Vercel serves it over HTTPS. The
  original `https://goodchapter-crm.vercel.app` alias remains attached.
  The application push deployed automatically. CI run
  `36868512775` succeeded for commit `86d0ca1`.
- Vercel project `techclaps/goodchapter-crm` is linked to the private GitHub
  repository. Production has Supabase, Resend, `CRM_DEMO_MODE=false` and exact
  `NEXT_PUBLIC_APP_URL` variables. Server credentials are secret values.
- Vercel's additional SSO deployment gate was disabled so staff can use the
  app's Supabase Auth login and customers can open a revocable document link.
  The public login page returns HTTP 200, the CRM API returns 401 without an
  application session, an invalid share link returns 404, and `/` redirects
  to `/login` without a session.
- Supabase project `putepoxwvtsipgrxhmlv` has both versioned migrations.
  Public signup is disabled, the primary Site URL is the custom host, both
  custom-host and Vercel-alias callback URLs are allowed,
  and branded Magic Link and Invite User templates are configured. Supabase
  Auth SMTP uses a separate Resend key from Vercel document sending.
- `parasnarula71@yahoo.in` is the sole initial Auth user and has an active
  owner profile. It was created without sending an invitation or setting a
  password. The owner can request a sign-in link on the CRM login page.
- Resend's root domain `thegoodchapter.in` is verified. Sender is
  `studio@thegoodchapter.in`; the user supplied the two sending keys directly
  to Supabase SMTP and Vercel. No real email has been sent or delivery tested.

## Verification completed

- GitHub CI on the deployed source passed lint, Node 24 production build,
  13 unit/PDF tests, 21 fresh-schema database scenarios, type checking and
  npm audit.
- A real, passwordless owner session was generated without sending email.
  Auth verification succeeded, the owner could read workspace settings, and
  anonymous direct profile reads were denied by PostgreSQL.
- A generated token-hash callback on the custom HTTPS host returned to `/`
  with a session cookie. Supabase's default Auth redirect also resolves to
  `https://app.thegoodchapter.in`. This did not send email.
- `scripts/verify-linked.sql` exercised linked Supabase permissions, pricing,
  conversion, payments, artwork approval, sharing and cancellation in a
  transaction that rolled back fictional records. Business records remain
  empty. The initial owner Auth user is the only persistent account.
- Before the request to stop browser access, the local fictional browser
  journey reached a settled ₹55,814 invoice; approval, vendor assignment and
  PDF pagination were inspected. No browser has been used for current
  deployment work.

## Remaining checks

1. The owner should visit the production login page, request a link to their
   Yahoo address and confirm that Resend SMTP delivers it and login succeeds.
   No link was sent automatically during provisioning.
2. Use an approved test recipient to check CRM document email, sender,
   reply-to, branding and revocable links. Do not send to a real customer as
   the first test.
3. Check real staff JWT permissions, private Storage, simultaneous
   transaction retries, and mobile/shared-document layouts in a separate
   staging environment before customer work. User requested no browser access
   for now, so visual inspection remains open.

The Techclaps Vercel workspace is Hobby, as the user specified for this
project. Reassess hosting terms and account capacity before commercial use.
