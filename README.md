# The Good Chapter CRM

A private CRM for custom merchandise and corporate gifting. Built with Next.js, Tailwind, shadcn/Radix, React Query, Supabase and Resend. The independent source provenance is recorded in [SOURCE.md](SOURCE.md).

Live application: [app.thegoodchapter.in](https://app.thegoodchapter.in). Invited users sign in with email and password. The first owner can use **Set or reset password** on `/login` to choose a password through a secure email link; email-link sign-in remains available.

## Local preview

Use Node 24 and npm.

```sh
npm ci
CRM_DEMO_MODE=true npm run dev
```

Open http://127.0.0.1:3100. Preview mode uses fictional records in in-memory PostgreSQL (PGlite), with the same migrations and permission rules as the application. Restarting clears those records. It does not connect to another CRM. Preview mode and its role switch cannot run in a production build. Email sending and team invitations are disabled in preview.

For a real staging Supabase project, copy `.env.example` to `.env.local`, populate the new project's values, set `CRM_DEMO_MODE=false`, and follow [deployment instructions](docs/DEPLOYMENT.md).

## Working in the CRM

1. Capture an enquiry, its brief, owner and follow-up. Create or link a client.
2. Build a quotation from catalogue templates or custom merchandise/service lines. Enter variants, discounts, charges, HSN/SAC and business-supplied tax rates. Review the customer-facing snapshot before marking it sent.
3. Manually record acceptance, then create the linked order. Retrying conversion returns the same order.
4. Assign vendors, attach private artwork versions, and record approval of the latest version. Production requires approval or an explicit approval-not-required choice.
5. Record courier, tracking and dispatch/delivery dates. Generate the order's invoice from Invoices or the order page, edit the draft, then issue it. An issued invoice can be revised into a new draft while the earlier version remains in history.
6. Record advances and receipts against the order. Invoice payment state (Unpaid, Partially paid, Fully paid) and balance derive from that ledger. Use Reports for invoiced sales and outstanding balances.

Quotes/invoices use INR. Reporting dates use Asia/Kolkata. Taxes start unset; the business supplies rates. Charges are ordinary itemised service lines. There is no stock ledger, gateway, purchase order, customer portal or accounting integration.

## Permissions and documents

All active staff share operational records and customer-facing finance. Owner and Admin manage users; Co-owner has business, cost and margin access without user management. Staff cannot see vendor costs or margins. Database RLS protects reads; direct table writes are denied and writes use a role-checked transaction. Uninvited accounts have no access. Service-role credentials are used only by the Owner/Admin invitation endpoint.

Deleting a teammate from User Management immediately removes their CRM access and moves them to Deleted users. Linked orders, assignments, approvals and financial/audit history remain intact. Owner/Admin can restore the profile; it stays inactive until explicitly reactivated.

Accepted quotations are immutable; revisions create new drafts. Invoices start from the accepted quotation. Drafts are editable; revising an issued invoice retains its historical version, revokes its old share link and creates one current draft for that order. Payments are immutable ledger entries; Owner/Admin/Co-owner refunds correct receipts. Cancellation retains documents and ledger history. Public links expose only the intended customer document, are revocable, and never include artwork or internal cost tables.

PDFs are downloaded on demand. WhatsApp/email shortcuts open a draft without changing status. The separate **Send with Resend** action previews the recipient and sends a document link only after staff submit it. Resend acceptance is not a delivery guarantee.

## Social publishing

Owner/Admin can connect an existing Buffer account at **Settings → Social publishing**. First connect a Professional Instagram account and/or LinkedIn Page in Buffer, then create a personal key in [Buffer Settings → API](https://publish.buffer.com/settings/api). Paste the key into the CRM, check it, select the Buffer organization, and save. The key is encrypted in Supabase using the existing server-only `SOCIAL_TOKEN_KEY`; it is never returned to the browser. Do not put the key in chat or a source file.

**Social Media** in the CRM lists connected Instagram/LinkedIn channels and recent posts with their media. Owner/Admin can compose Instagram Posts, Reels and Stories or LinkedIn posts, upload JPG/PNG/WebP images (up to 8 MB) or MP4 videos (up to 25 MB), preview content, set a first comment, apply existing Buffer tags, save drafts, add to the queue, schedule a time, or publish immediately with confirmation. Instagram reminder publishing supports notes for music and product tags; these are prompts for the person publishing manually, not automated Instagram actions. Existing public HTTPS media URLs also work. Media is stored in a separate **public** Supabase bucket with stable URLs because Buffer fetches it when publishing; private CRM artwork is never used. LinkedIn text posts work without media. Scheduled posts can be edited or deleted. There is no automatic social inbox or message sync yet. Buffer channel limits and publishing permissions still apply.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm audit
```

`test:db` builds a fresh PostgreSQL schema in PGlite, including Supabase-style roles and storage tables, then exercises the application migration, transactions, snapshots, payment retries and direct-access permissions. Live Supabase Auth, Storage, concurrent database sessions and email delivery must also be checked in staging before release. See [validation checklist](docs/VALIDATION.md).
