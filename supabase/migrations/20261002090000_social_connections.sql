-- One authorised business identity per provider. Tokens are encrypted by the
-- application before reaching Postgres and never exposed through table grants.
create table public.social_app_configs (
  platform text primary key check (platform in ('instagram', 'linkedin')),
  client_id text not null check (length(client_id) between 1 and 255),
  client_secret_cipher text not null,
  requested_scopes text[] not null,
  configured_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.social_app_configs enable row level security;
revoke all on public.social_app_configs from public, anon, authenticated;

create function public.social_app_config_status()
returns table (platform text, client_id text, requested_scopes text[], updated_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_member() then
    raise exception 'CRM access required' using errcode='42501';
  end if;
  return query select c.platform,c.client_id,c.requested_scopes,c.updated_at
  from public.social_app_configs c order by c.platform;
end $$;
revoke all on function public.social_app_config_status() from public, anon;
grant execute on function public.social_app_config_status() to authenticated;

-- Only the server reads this encrypted value when starting/completing OAuth.
create function public.social_app_config_secret(p_platform text)
returns table (client_id text, client_secret_cipher text, requested_scopes text[])
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.can_manage_users() then
    raise exception 'Owner or Admin access required' using errcode='42501';
  end if;
  return query select c.client_id,c.client_secret_cipher,c.requested_scopes
  from public.social_app_configs c where c.platform=p_platform;
end $$;
revoke all on function public.social_app_config_secret(text) from public, anon;
grant execute on function public.social_app_config_secret(text) to authenticated;

create function public.save_social_app_config(
  p_platform text, p_client_id text, p_client_secret_cipher text,
  p_requested_scopes text[]
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_users() then
    raise exception 'Owner or Admin access required' using errcode='42501';
  end if;
  if p_platform not in ('instagram','linkedin') or
     length(trim(coalesce(p_client_id,''))) not between 1 and 255 or
     length(coalesce(p_client_secret_cipher,'')) < 32 or
     coalesce(array_length(p_requested_scopes,1),0) = 0 then
    raise exception 'Invalid developer app configuration';
  end if;
  insert into public.social_app_configs (
    platform,client_id,client_secret_cipher,requested_scopes,configured_by
  ) values (
    p_platform,trim(p_client_id),p_client_secret_cipher,p_requested_scopes,auth.uid()
  ) on conflict(platform) do update set
    client_id=excluded.client_id,
    client_secret_cipher=excluded.client_secret_cipher,
    requested_scopes=excluded.requested_scopes,
    configured_by=excluded.configured_by,
    updated_at=now();
  delete from public.social_connections where platform=p_platform;
  insert into public.audit_events(actor_id,action)
  values (auth.uid(), 'configure_' || p_platform);
end $$;
revoke all on function public.save_social_app_config(text,text,text,text[]) from public, anon;
grant execute on function public.save_social_app_config(text,text,text,text[]) to authenticated;

create table public.social_connections (
  platform text primary key check (platform in ('instagram', 'linkedin')),
  account_id text not null check (length(account_id) between 1 and 255),
  display_name text not null check (length(display_name) between 1 and 255),
  access_token_cipher text not null,
  refresh_token_cipher text,
  expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  connected_by uuid not null references public.profiles(id),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_connections enable row level security;
revoke all on public.social_connections from public, anon, authenticated;

-- This is the only browser-readable projection. It deliberately omits tokens.
create function public.social_connection_status()
returns table (
  platform text,
  account_id text,
  display_name text,
  expires_at timestamptz,
  granted_scopes text[],
  connected_at timestamptz
)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_member() then
    raise exception 'CRM access required' using errcode='42501';
  end if;
  return query select c.platform, c.account_id, c.display_name,
    c.expires_at, c.granted_scopes, c.connected_at
  from public.social_connections c order by c.platform;
end $$;
revoke all on function public.social_connection_status() from public, anon;
grant execute on function public.social_connection_status() to authenticated;

create function public.save_social_connection(
  p_platform text,
  p_account_id text,
  p_display_name text,
  p_access_token_cipher text,
  p_refresh_token_cipher text,
  p_expires_at timestamptz,
  p_granted_scopes text[]
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_users() then
    raise exception 'Owner or Admin access required' using errcode='42501';
  end if;
  if p_platform not in ('instagram','linkedin') or
     length(trim(coalesce(p_account_id,''))) not between 1 and 255 or
     length(trim(coalesce(p_display_name,''))) not between 1 and 255 or
     length(coalesce(p_access_token_cipher,'')) < 32 then
    raise exception 'Invalid social connection';
  end if;
  insert into public.social_connections (
    platform, account_id, display_name, access_token_cipher,
    refresh_token_cipher, expires_at, granted_scopes, connected_by
  ) values (
    p_platform, p_account_id, p_display_name, p_access_token_cipher,
    p_refresh_token_cipher, p_expires_at, coalesce(p_granted_scopes,'{}'), auth.uid()
  ) on conflict(platform) do update set
    account_id=excluded.account_id,
    display_name=excluded.display_name,
    access_token_cipher=excluded.access_token_cipher,
    refresh_token_cipher=excluded.refresh_token_cipher,
    expires_at=excluded.expires_at,
    granted_scopes=excluded.granted_scopes,
    connected_by=excluded.connected_by,
    connected_at=now(),
    updated_at=now();
  insert into public.audit_events(actor_id,action)
  values (auth.uid(), 'connect_' || p_platform);
end $$;
revoke all on function public.save_social_connection(text,text,text,text,text,timestamptz,text[]) from public, anon;
grant execute on function public.save_social_connection(text,text,text,text,text,timestamptz,text[]) to authenticated;

create function public.remove_social_connection(p_platform text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_users() then
    raise exception 'Owner or Admin access required' using errcode='42501';
  end if;
  if p_platform not in ('instagram','linkedin') then
    raise exception 'Invalid social connection';
  end if;
  delete from public.social_connections where platform=p_platform;
  insert into public.audit_events(actor_id,action)
  values (auth.uid(), 'disconnect_' || p_platform);
end $$;
revoke all on function public.remove_social_connection(text) from public, anon;
grant execute on function public.remove_social_connection(text) to authenticated;
