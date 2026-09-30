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
- Check hosting account capacity and commercial eligibility before production.

Production is not ready until these live staging checks and configuration are complete.
