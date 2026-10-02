-- A recipient can be entered directly in Mail center without creating a client.
-- Save the whole draft and its recipient snapshot in one transaction.
create function public.save_mail_campaign_with_recipients(
  p_id uuid,
  p_subject text,
  p_body text,
  p_client_ids uuid[],
  p_external_recipients jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  requested integer;
  selected integer;
  external_count integer;
begin
  if not public.can_manage_users() then
    raise exception 'Owner or Admin access required' using errcode='42501';
  end if;
  if not exists(select 1 from public.mail_credentials where id=true) then
    raise exception 'Connect your mailbox before creating a mailshot';
  end if;
  if length(trim(p_subject)) not between 1 and 240 or length(trim(p_body)) > 50000 then
    raise exception 'Invalid subject or message';
  end if;
  if p_external_recipients is null or jsonb_typeof(p_external_recipients) <> 'array' then
    raise exception 'Invalid email recipients';
  end if;
  if jsonb_array_length(p_external_recipients) > 200 then
    raise exception 'Invalid email recipients';
  end if;

  select count(distinct x) into requested from unnest(p_client_ids) x;
  external_count := jsonb_array_length(p_external_recipients);
  if requested + external_count not between 1 and 200 then
    raise exception 'Choose 1 to 200 recipients';
  end if;
  select count(*) into selected from public.clients c
    where c.id=any(p_client_ids) and not c.archived
      and trim(c.email) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and not exists(select 1 from public.mail_opt_outs o where o.email=lower(trim(c.email)));
  if selected<>requested then
    raise exception 'A selected client is missing, archived, has no email, or opted out';
  end if;
  if (select count(distinct lower(trim(c.email))) from public.clients c where c.id=any(p_client_ids))<>requested then
    raise exception 'Selected clients must have unique email addresses';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_external_recipients) x
    where jsonb_typeof(x)<>'object' or
      length(trim(coalesce(x->>'email',''))) not between 5 and 254 or
      trim(coalesce(x->>'email','')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
      length(trim(coalesce(x->>'name',''))) > 100
  ) then
    raise exception 'Enter a valid recipient name and email address';
  end if;
  if (select count(distinct lower(trim(x.email)))
      from jsonb_to_recordset(p_external_recipients) as x(name text,email text))<>external_count or
     exists(
       select 1 from jsonb_to_recordset(p_external_recipients) as x(name text,email text)
       join public.clients c on c.id=any(p_client_ids) and lower(trim(c.email))=lower(trim(x.email))
     ) then
    raise exception 'Each recipient email address must be unique';
  end if;
  if exists(
    select 1 from jsonb_to_recordset(p_external_recipients) as x(name text,email text)
    join public.mail_opt_outs o on o.email=lower(trim(x.email))
  ) then
    raise exception 'A recipient has opted out of mailshots';
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
    select v_id,c.id,c.name,c.organisation,lower(trim(c.email))
    from public.clients c where c.id=any(p_client_ids);
  insert into public.mail_recipients(campaign_id,name,organisation,email)
    select v_id,trim(coalesce(x.name,'')),'',lower(trim(x.email))
    from jsonb_to_recordset(p_external_recipients) as x(name text,email text);
  return v_id;
end $$;

revoke all on function public.save_mail_campaign_with_recipients(uuid,text,text,uuid[],jsonb) from public, anon;
grant execute on function public.save_mail_campaign_with_recipients(uuid,text,text,uuid[],jsonb) to authenticated;
