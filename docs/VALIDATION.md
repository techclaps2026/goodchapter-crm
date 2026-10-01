# Validation and release record

## Automated local checks

- Unit tests: discounts, quantities, charges, split GST rounding, input boundaries, net receipts/overpayments, email HTML escaping, PDF pagination and same-origin protection.
- PostgreSQL/PGlite tests: fresh schema, authoritative pricing, accepted document stability, conversion idempotency, latest-artwork approval gate, unique order invoice, payment retry keys, cancellation/refunds, public document allowlist/revocation, anonymous denial, staff cost/settings denial, direct table write denial, deactivation and uninvited signup denial.
- Lint, TypeScript, production build and npm audit must pass against the final commit.

## Browser and document checks

Use fictional records only. Record exact results here before release.

- Enquiry -> client -> mixed-item quotation -> acceptance -> order.
- Production blocked without approval; attach a version, record approval, verify a new version invalidates that approval.
- Vendor assignment, delivery dates, dispatch/tracking and delivered status.
- Itemised invoice, advance + final receipt, zero balance; cancellation retains ledger.
- Public share view and PDF contain no notes, costs, private artwork or unrelated records; revoke and verify the old URL fails.
- Desktop and mobile navigation, modal scroll, empty states, validation and save failure recovery.
- PDF branding, long descriptions, multi-page table headers, totals and footers.

## Required live staging checks (not replaced by local tests)

- Apply the complete migration on a fresh Supabase database with real Auth/Storage schemas.
- Test owner and staff JWTs with direct PostgREST and RPC requests; attempt cost reads, direct writes and privilege escalation.
- Use independent simultaneous database clients to retry conversion and payment recording.
- Verify private file access, no anonymous downloads/overwrites, 4 MB upload limit and signed-link expiry.
- Validate magic-link/invitation delivery through Resend SMTP and actual document email delivery to an approved test address.
- Validate the recovery email, token-hash callback, password setup, password sign-in and email-link fallback with a real owner account.
- Reassess hosting account capacity and commercial eligibility before customer work.

The production URL is deployed, but customer work should wait for these live checks.

## 1 October checkpoint

The initial GitHub CI passed. Two versioned migrations are applied to the
dedicated Supabase project. `scripts/verify-linked.sql` passed against the
real database, then rolled back every fictional record; live Auth users,
clients, documents and payments were zero afterward. This covers the real
database roles but does not substitute for real Auth JWT or Storage tests.

The local browser journey completed through invoice settlement, with
₹55,814 received and zero balance. The approval gate, artwork version and
vendor assignment were exercised. The local preview's date parsing was
corrected and a deadline persisted across reload. Quote branding and invoice
pagination were inspected. Shared-page and mobile visual checks remain open;
browser access was stopped at the user's request.

The latest GitHub CI passed and Vercel deployed it. The custom production
domain is `https://app.thegoodchapter.in`; the original Vercel alias remains.
Production environment variable names
and types were verified. Supabase production Auth Site URL and callback,
disabled public signup, and branded Magic Link/Invite User templates were
configured. An active owner profile for `parasnarula71@yahoo.in` was created
without sending an email. The verified Resend domain, separate API keys,
Supabase SMTP and Vercel sender settings were supplied by the user. Public
HTTP checks returned 200 for login, 401 for unauthenticated CRM data and 404
for an invalid share link. A real owner JWT accessed workspace settings; an
anonymous profile query was denied. Real SMTP delivery, interactive owner
login, document-email delivery, staff JWT/Storage checks and visual
inspection remain open.

GoDaddy's authoritative DNS serves the exact Vercel CNAME and ownership TXT
record for `app.thegoodchapter.in`. Vercel verified the host and serves a
valid HTTPS certificate. The custom host returned 200 for login, 401 for the
unauthenticated CRM API, 404 for an invalid document link, and a redirect to
its own `/login` from `/`. A generated token-hash Auth callback set a session
cookie and redirected to the custom host. No email was sent for this test.
