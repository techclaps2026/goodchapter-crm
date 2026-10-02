-- Personal profile photos are private. Members can manage only their own files.
alter table public.profiles add column avatar_path text not null default '';

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy profile_avatar_read on storage.objects for select to authenticated
using (bucket_id = 'profile-avatars' and public.is_member()
       and (storage.foldername(name))[1] = auth.uid()::text);
create policy profile_avatar_insert on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and public.is_member()
            and (storage.foldername(name))[1] = auth.uid()::text);
create policy profile_avatar_delete on storage.objects for delete to authenticated
using (bucket_id = 'profile-avatars' and public.is_member()
       and (storage.foldername(name))[1] = auth.uid()::text);

create function public.set_my_avatar(p_storage_path text) returns text
language plpgsql security definer set search_path = public, storage as $$
declare previous_path text;
begin
  if not public.is_member() then
    raise exception 'Sign in with an active team account' using errcode = '42501';
  end if;
  if p_storage_path is null or
     (p_storage_path <> '' and (
       p_storage_path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$') or
       not exists (select 1 from storage.objects
                   where bucket_id = 'profile-avatars' and name = p_storage_path)
     )) then
    raise exception 'Upload a profile photo first';
  end if;
  select avatar_path into previous_path from public.profiles
  where id = auth.uid() for update;
  update public.profiles set avatar_path = p_storage_path where id = auth.uid();
  return previous_path;
end $$;
revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;
