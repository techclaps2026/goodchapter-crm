-- Admin and co-owner have the same full access as owner. Staff remain
-- operational users without access to costs, margins or team settings.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'co_owner', 'admin', 'staff'));

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles
    where id=auth.uid() and active and role in ('owner', 'co_owner', 'admin')
  )
$$;

revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Every active teammate can edit their own display name, never their role.
create function public.update_my_profile(p_full_name text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_member() then
    raise exception 'Sign in with an active team account' using errcode='42501';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 1 and 100 then
    raise exception 'Enter a name of up to 100 characters';
  end if;
  update public.profiles set full_name=trim(p_full_name) where id=auth.uid();
end $$;
revoke all on function public.update_my_profile(text) from public, anon;
grant execute on function public.update_my_profile(text) to authenticated;
