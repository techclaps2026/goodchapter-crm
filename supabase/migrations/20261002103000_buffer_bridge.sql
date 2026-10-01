-- Buffer delivers social posts; its account key stays encrypted and private.
create table public.buffer_config (
  id boolean primary key default true check (id),
  api_key_cipher text not null,
  organization_id text not null,
  organization_name text not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.buffer_config enable row level security;
revoke all on public.buffer_config from public, anon, authenticated;

create function public.buffer_config_status()
returns table (organization_id text, organization_name text, updated_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_member() then raise exception 'CRM access required' using errcode='42501'; end if;
  return query select b.organization_id,b.organization_name,b.updated_at from public.buffer_config b;
end $$;
revoke all on function public.buffer_config_status() from public, anon;
grant execute on function public.buffer_config_status() to authenticated;

create function public.buffer_config_secret()
returns table (api_key_cipher text, organization_id text, organization_name text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  return query select b.api_key_cipher,b.organization_id,b.organization_name from public.buffer_config b;
end $$;
revoke all on function public.buffer_config_secret() from public, anon;
grant execute on function public.buffer_config_secret() to authenticated;

create function public.save_buffer_config(p_cipher text, p_organization_id text, p_organization_name text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if length(coalesce(p_cipher,'')) < 32 or length(trim(coalesce(p_organization_id,''))) not between 1 and 255 or
     length(trim(coalesce(p_organization_name,''))) not between 1 and 255 then
    raise exception 'Invalid Buffer configuration';
  end if;
  insert into public.buffer_config(id,api_key_cipher,organization_id,organization_name,updated_by)
  values(true,p_cipher,trim(p_organization_id),trim(p_organization_name),auth.uid())
  on conflict(id) do update set api_key_cipher=excluded.api_key_cipher,
    organization_id=excluded.organization_id,organization_name=excluded.organization_name,
    updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_events(actor_id,action) values(auth.uid(),'configure_buffer');
end $$;
revoke all on function public.save_buffer_config(text,text,text) from public, anon;
grant execute on function public.save_buffer_config(text,text,text) to authenticated;

-- A claimed key is never automatically retried after an uncertain external result.
create table public.buffer_post_requests (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  channel_id text not null,
  state text not null check (state in ('submitting','succeeded','failed','unknown')),
  buffer_post_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.buffer_post_requests enable row level security;
revoke all on public.buffer_post_requests from public, anon, authenticated;

create function public.claim_buffer_post(p_id uuid, p_channel_id text)
returns table (claimed boolean, state text, buffer_post_id text, error_message text)
language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if p_id is null or length(trim(coalesce(p_channel_id,''))) not between 1 and 255 then
    raise exception 'Invalid post request';
  end if;
  insert into public.buffer_post_requests(id,actor_id,channel_id,state)
  values(p_id,auth.uid(),trim(p_channel_id),'submitting') on conflict(id) do nothing;
  get diagnostics inserted_count = row_count;
  return query select inserted_count=1,r.state,r.buffer_post_id,r.error_message from public.buffer_post_requests r where r.id=p_id;
end $$;
revoke all on function public.claim_buffer_post(uuid,text) from public, anon;
grant execute on function public.claim_buffer_post(uuid,text) to authenticated;

create function public.finish_buffer_post(p_id uuid, p_state text, p_buffer_post_id text, p_error text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if p_state not in ('succeeded','failed','unknown') then raise exception 'Invalid post state'; end if;
  update public.buffer_post_requests set state=p_state,buffer_post_id=p_buffer_post_id,
    error_message=left(p_error,500),updated_at=now()
  where id=p_id and actor_id=auth.uid() and state='submitting';
  if not found then raise exception 'Post request not found'; end if;
end $$;
revoke all on function public.finish_buffer_post(uuid,text,text,text) from public, anon;
grant execute on function public.finish_buffer_post(uuid,text,text,text) to authenticated;
