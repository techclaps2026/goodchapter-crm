-- A sender default is not a connected mailbox. Save connection and visible
-- sender atomically, and require that connection for mailshot mutations.
create or replace function public.save_mail_credentials(p_email text, p_cipher text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_cipher) < 30 then
    raise exception 'Invalid mailbox configuration';
  end if;
  insert into public.mail_credentials(id,email,password_cipher)
    values(true,lower(trim(p_email)),p_cipher)
    on conflict(id) do update set email=excluded.email,password_cipher=excluded.password_cipher,updated_at=now();
  update public.mail_settings set sender_email=lower(trim(p_email)),
    reply_to_email=lower(trim(p_email)), updated_at=now() where id=true;
end $$;

create or replace function public.save_mail_settings(
  p_sender_name text, p_sender_email text, p_reply_to_email text,
  p_inbound_address text, p_signature text
) returns void language plpgsql security definer set search_path=public as $$
declare v_mailbox_email text;
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
  select email into v_mailbox_email from public.mail_credentials where id=true;
  update public.mail_settings set sender_name=trim(p_sender_name),
    sender_email=coalesce(v_mailbox_email,lower(trim(p_sender_email))),
    reply_to_email=coalesce(v_mailbox_email,lower(trim(p_reply_to_email))),
    inbound_address=lower(trim(p_inbound_address)), signature=p_signature, updated_at=now();
end $$;

create or replace function public.save_mail_campaign(p_id uuid, p_subject text, p_body text, p_client_ids uuid[])
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; requested integer; selected integer; begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if not exists(select 1 from public.mail_credentials where id=true) then raise exception 'Connect your mailbox before creating a mailshot'; end if;
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

create or replace function public.claim_mail_campaign(p_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_id uuid; begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if not exists(select 1 from public.mail_credentials where id=true) then raise exception 'Connect your mailbox before sending a mailshot'; end if;
  select id into v_id from public.mail_campaigns where id=p_id and status='draft' for update;
  if not found then return false; end if;
  if not exists(select 1 from public.mail_recipients where campaign_id=p_id) then raise exception 'No recipients'; end if;
  update public.mail_campaigns set status='sending' where id=p_id;
  return true;
end $$;
