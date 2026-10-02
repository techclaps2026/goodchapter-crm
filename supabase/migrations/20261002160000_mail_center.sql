-- CRM mail is independent of authentication SMTP and of the document sender.
create table public.mail_settings (
  id boolean primary key default true check (id),
  sender_name text not null default 'The Good Chapter',
  sender_email text not null default 'studio@thegoodchapter.in',
  reply_to_email text not null default 'hello@thegoodchapter.in',
  inbound_address text not null default '',
  signature text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.mail_settings(id) values (true);
create table public.mail_credentials (
  id boolean primary key default true check (id),
  email text not null,
  password_cipher text not null,
  updated_at timestamptz not null default now()
);

create table public.mail_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (length(subject) between 1 and 240),
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','sending','sent','partial','failed')),
  sender_name text not null default '',
  sender_email text not null default '',
  reply_to_email text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create table public.mail_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mail_campaigns(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null default '',
  organisation text not null default '',
  email text not null,
  status text not null default 'pending' check (status in ('pending','accepted','delivered','opened','bounced','complained','failed','skipped')),
  resend_id text unique,
  error text,
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  unique(campaign_id, email)
);
create index mail_recipients_campaign_idx on public.mail_recipients(campaign_id);
create table public.mail_opt_outs (
  email text primary key,
  created_at timestamptz not null default now(),
  source text not null default 'unsubscribe'
);
create table public.mail_events (
  webhook_id text primary key,
  resend_id text not null,
  recipient_id uuid references public.mail_recipients(id),
  event_type text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index mail_events_resend_idx on public.mail_events(resend_id);
create table public.mail_inbox (
  id uuid primary key default gen_random_uuid(),
  resend_id text not null unique,
  from_email text not null,
  to_email text not null,
  subject text not null default '',
  body text not null default '',
  client_id uuid references public.clients(id) on delete set null,
  received_at timestamptz not null default now(),
  read_at timestamptz
);
create index mail_inbox_received_idx on public.mail_inbox(received_at desc);

do $$ declare t text; begin
  foreach t in array array['mail_settings','mail_campaigns','mail_recipients','mail_inbox'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy manager_read on public.%I for select to authenticated using (public.can_manage_users())', t);
  end loop;
  foreach t in array array['mail_opt_outs','mail_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  alter table public.mail_credentials enable row level security;
  revoke all on public.mail_credentials from anon, authenticated;
end $$;

create function public.save_mail_settings(
  p_sender_name text, p_sender_email text, p_reply_to_email text,
  p_inbound_address text, p_signature text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if length(trim(p_sender_name)) not between 1 and 100 or p_sender_name ~ '[[:cntrl:]<>]' or
     length(trim(p_sender_email)) not between 5 and 254 or
     trim(p_sender_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
     length(trim(p_reply_to_email)) not between 5 and 254 or
     trim(p_reply_to_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
     length(p_signature) > 2000 or length(p_inbound_address) > 254 then
    raise exception 'Invalid mail settings';
  end if;
  update public.mail_settings set sender_name=trim(p_sender_name),
    sender_email=lower(trim(p_sender_email)), reply_to_email=lower(trim(p_reply_to_email)),
    inbound_address=lower(trim(p_inbound_address)), signature=p_signature, updated_at=now();
end $$;
revoke all on function public.save_mail_settings(text,text,text,text,text) from public, anon;
grant execute on function public.save_mail_settings(text,text,text,text,text) to authenticated;

create function public.save_mail_credentials(p_email text, p_cipher text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_cipher) < 30 then
    raise exception 'Invalid mailbox configuration';
  end if;
  insert into public.mail_credentials(id,email,password_cipher)
    values(true,lower(trim(p_email)),p_cipher)
    on conflict(id) do update set email=excluded.email,password_cipher=excluded.password_cipher,updated_at=now();
end $$;
revoke all on function public.save_mail_credentials(text,text) from public, anon;
grant execute on function public.save_mail_credentials(text,text) to authenticated;

-- One transaction snapshots recipients and makes the draft editable without
-- ever rewriting an already-sent campaign.
create function public.save_mail_campaign(p_id uuid, p_subject text, p_body text, p_client_ids uuid[])
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; requested integer; selected integer; begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if length(trim(p_subject)) not between 1 and 240 or length(trim(p_body)) > 50000 then raise exception 'Invalid subject or message'; end if;
  select count(distinct x) into requested from unnest(p_client_ids) x;
  if requested not between 1 and 200 then raise exception 'Choose 1 to 200 clients'; end if;
  select count(*) into selected from public.clients c
    where c.id=any(p_client_ids) and not c.archived
      and trim(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and not exists(select 1 from public.mail_opt_outs o where o.email=lower(trim(c.email)));
  if selected<>requested then raise exception 'A selected client is missing, archived, has no email, or opted out'; end if;
  if (select count(distinct lower(trim(c.email))) from public.clients c where c.id=any(p_client_ids))<>requested then
    raise exception 'Selected clients must have unique email addresses';
  end if;
  if p_id is null then
    insert into public.mail_campaigns(subject,body,created_by)
      values(trim(p_subject),p_body,auth.uid()) returning id into v_id;
  else
    select id into v_id from public.mail_campaigns where id=p_id and status='draft' for update;
    if not found then raise exception 'Only drafts can be edited'; end if;
    update public.mail_campaigns set subject=trim(p_subject), body=p_body where id=v_id;
    delete from public.mail_recipients where campaign_id=v_id;
  end if;
  insert into public.mail_recipients(campaign_id,client_id,name,organisation,email)
    select distinct on (lower(trim(c.email))) v_id,c.id,c.name,c.organisation,lower(trim(c.email))
    from public.clients c where c.id=any(p_client_ids) order by lower(trim(c.email)),c.id;
  return v_id;
end $$;
revoke all on function public.save_mail_campaign(uuid,text,text,uuid[]) from public, anon;
grant execute on function public.save_mail_campaign(uuid,text,text,uuid[]) to authenticated;

create function public.claim_mail_campaign(p_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_id uuid; begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  select id into v_id from public.mail_campaigns where id=p_id and status='draft' for update;
  if not found then return false; end if;
  if not exists(select 1 from public.mail_recipients where campaign_id=p_id) then raise exception 'No recipients'; end if;
  update public.mail_campaigns set status='sending' where id=p_id;
  return true;
end $$;
revoke all on function public.claim_mail_campaign(uuid) from public, anon;
grant execute on function public.claim_mail_campaign(uuid) to authenticated;
