# Fresh deployment

Use a separate Supabase project and Vercel project. Never link the CLI to Tripclaps, BML or another existing application's database. GitHub destination: `techclaps2026/goodchapter-crm` (private).

## Supabase

1. Create the new project in the user's chosen organisation and region. Confirm project capacity, storage limits, backups and any charges in that account before provisioning. Use a separate staging project for fictional verification if capacity allows.
2. Apply `supabase/migrations/20260929180000_goodchapter.sql` to the empty project. Prefer Supabase CLI migrations; for a one-off dashboard application, record this version in migration history before adopting the CLI. The migration creates settings only, with no business/customer records.
3. Set Auth Site URL to the deployed CRM origin. Allow its `/auth/callback` URL and the deliberate staging/local callback URLs. Disable public email signup and anonymous sign-ins. Team invitations use the admin API.
4. Configure Resend custom SMTP for Supabase Auth. Use a verified sending domain, host `smtp.resend.com`, port `465`, username `resend`, and an API key entered directly into Supabase's SMTP password field. Set the sender name to The Good Chapter. Supabase's default mail server is not a production mail service. See [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp) and [Resend setup](https://resend.com/docs/send-with-supabase-smtp).
5. Set the **Magic Link** email template button to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`. Set the **Invite User** button to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite`. These server-verifiable tokens work without relying on a URL fragment. In a separate staging project, Site URL must point to staging.
6. Invite the initial owner through Supabase Auth's Users page. Once the exact invited user exists, promote that specific UUID in SQL Editor:

```sql
-- Replace with the verified invited user's UUID from Auth > Users.
update public.profiles
set role = 'owner', active = true
where id = 'REPLACE_WITH_OWNER_UUID'::uuid;
```

Verify exactly one row was updated and the email/UUID match the intended owner. Other invited accounts default to staff. Uninvited signup accounts default inactive. There is no public owner-bootstrap endpoint or seeded password.

CLI outline (after authenticating; use only the new project reference):

```sh
supabase link --project-ref NEW_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Do not run a remote reset. Do not run fictional demo seeding against a remote project. Review live RLS using owner, staff and anonymous clients, and test Storage with their real JWTs; local PGlite only emulates the Supabase service tables.

## Vercel

Import the private GitHub repository into the Techclaps workspace as `goodchapter-crm`. Select Next.js, repository root `.`, Node 24, `npm ci`, and `npm run build`; use framework defaults for output. Configure these environment values for the corresponding Supabase environment:

| Variable                        | Purpose                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | New project's API URL                                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon/publishable key; RLS protects data                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only invitation credential                                  |
| `NEXT_PUBLIC_APP_URL`           | Exact HTTPS CRM origin                                             |
| `RESEND_API_KEY`                | Server-only sending key                                            |
| `RESEND_FROM_EMAIL`             | Verified sender, e.g. `The Good Chapter <hello@thegoodchapter.in>` |
| `RESEND_REPLY_TO`               | Business reply address                                             |
| `CRM_DEMO_MODE`                 | `false`                                                            |

Enter secrets in Vercel/Supabase settings, not in Git or chat. Public env values are embedded at build time; redeploy after changing them. Keep staging and production variables distinct. A build without Supabase variables shows a setup screen and cannot be treated as a usable production release.

The previously observed Techclaps account was Hobby. Vercel states Hobby is for personal, non-commercial use; confirm an eligible commercial plan before business launch. No upgrade or recurring charge has been authorised. See [Vercel plan conditions](https://vercel.com/docs/plans/hobby).

## Resend document sending

The verified root sending domain and sender settings are documented in
[EMAIL-SETUP.md](EMAIL-SETUP.md). The user confirmed this domain on
1 October 2026.

Verify the sending domain and DNS records in Resend. Use a sending key limited to that domain where available. The CRM sends only on the explicit Send with Resend form submission; document-link sharing shortcuts do not send. Auth mail uses Supabase SMTP separately from the CRM API. Test delivery to a user-designated address, inspect the Resend delivery event and check the link, branding, revocation and PDF. Do not use a real customer as a test recipient.

## Release gate

Run the checks in README and complete `docs/VALIDATION.md` in staging. Confirm owner access, invitation and magic-link login, owner/staff database permissions, private artwork, document links, ledger balance and real SMTP delivery. Then apply migrations to an empty production project, configure the owner and business settings, and deploy production. Keep the fictional staging records out of production.
