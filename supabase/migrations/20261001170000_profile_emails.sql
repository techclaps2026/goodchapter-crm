-- Team management needs an unambiguous email next to each invited user.
alter table public.profiles add column email text not null default '';
update public.profiles p
set email=coalesce((select u.email from auth.users u where u.id=p.id),'');

create or replace function public.provision_profile() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,email,active)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),
         coalesce(new.email,''),new.invited_at is not null);
  return new;
end $$;

create function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.profiles set email=coalesce(new.email,'') where id=new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.sync_profile_email();
revoke execute on function public.sync_profile_email() from public, anon, authenticated;
