# Current checkpoint — 1 October 2026

## Application and source

The independent CRM is in the private repository
https://github.com/techclaps2026/goodchapter-crm. Initial GitHub CI passed.
Both Tripclaps and BML references were refreshed; their local changes were
preserved. Provenance is in [SOURCE.md](../SOURCE.md).

The first release covers leads, clients, follow-ups, products, vendors,
quotations, orders, artwork approvals, invoices, payments and reports. Local
demo records are fictional and disappear on server restart. They never touch
the live Supabase project.

## Verification

- Node 24: lint, production build, 13 unit/PDF tests, 21 database scenarios,
  and npm audit all passed before the latest migration and date parser change.
  Repeat final checks after the last commit.
- Browser: enquiry through settled invoice was completed with fictional
  records; approval gate and vendor assignment worked. A branded quote PDF
  and six-page invoice were visually inspected. The local date parser was fixed
  and a changed order deadline was verified after reload.
- Supabase project `putepoxwvtsipgrxhmlv` has migrations
  `20260929180000` and `20261001080000`. A linked transaction checked roles,
  pricing, quote immutability, conversion and payment retries, approval gate,
  settlement, sharing, revocation and cancellation. It rolled back all test
  records. Live Auth user, business and payment counts were zero afterward.
- The live database security advisor still flags only intentional public
  document sharing and role-checked CRM RPC functions. The unnecessary
  anonymous helper execution grants were removed.

## Provisioning

- Vercel project `techclaps/goodchapter-crm` exists, linked locally, with
  Next.js, Node 24, `npm ci` and `npm run build`. Supabase URL, anon key,
  server service key and demo=false were submitted as production environment
  values. The CLI environment listing still needs a successful readback. The
  local Vercel CLI later switched to the separate `parass71` login, which
  currently receives 403 for the Techclaps project. Sign back into
  `techclaps2026` before continuing Vercel configuration.
- Techclaps is on Vercel Hobby. Vercel restricts Hobby to non-commercial use.
  No deployment or paid plan change has been made.
- Resend domain `mail.thegoodchapter.in` was added to the user's account with
  the records in [EMAIL-SETUP.md](EMAIL-SETUP.md). The user reported it is now
  verified. The sender, API key and Supabase Auth SMTP remain unconfigured.
- Initial owner address supplied by the user: `parasnarula71@yahoo.in`. No
  Auth user or email invitation has been created yet.

## Remaining release work

1. Confirm an eligible commercial hosting plan. Finish Vercel environment
   values, deploy and set the exact HTTPS app URL.
2. Configure Resend sender/key and Supabase Auth SMTP, redirect URLs, and
   token-hash email templates. Invite the named owner, then promote that
   specific Auth UUID to owner.
3. Use a separate staging environment for real JWT/Storage and email delivery
   tests before business use. Mobile and shared-document browser inspection
   still need completion; user requested no further browser access for now.

No production deployment or real email has occurred.
