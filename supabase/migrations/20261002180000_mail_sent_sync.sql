-- Messages imported from the connected mailbox's Sent folder. CRM mailshots
-- remain in mail_campaigns with their per-recipient delivery tracking.
create table public.mail_sent (
  id uuid primary key default gen_random_uuid(),
  imap_id text not null unique,
  from_email text not null,
  to_email text not null default '',
  subject text not null default '',
  body text not null default '',
  client_id uuid references public.clients(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index mail_sent_sent_at_idx on public.mail_sent(sent_at desc);
alter table public.mail_sent enable row level security;
revoke all on public.mail_sent from anon, authenticated;
grant select on public.mail_sent to authenticated;
create policy manager_read on public.mail_sent for select to authenticated
  using (public.can_manage_users());
