alter table public.vendors
  add column subcategories text not null default '',
  add column catalog_path text not null default '',
  add column catalog_name text not null default '';

-- Keep vendor edits on the existing allowlisted mutation path.
do $$
declare definition text;
declare previous text := 'when ''vendors'' then array[''name'',''category'',''contact_name'',''email'',''phone'',''city'',''notes'',''archived'']';
begin
  select pg_get_functiondef('public.crm_mutate(text,jsonb,uuid)'::regprocedure) into definition;
  if position(previous in definition) = 0 then
    raise exception 'Vendor mutation allowlist has changed';
  end if;
  execute replace(definition, previous,
    'when ''vendors'' then array[''name'',''category'',''subcategories'',''contact_name'',''email'',''phone'',''city'',''notes'',''archived'']');
end $$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-catalogs', 'vendor-catalogs', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

create policy vendor_catalog_read on storage.objects for select to authenticated
using (bucket_id = 'vendor-catalogs' and public.is_member()
  and exists (select 1 from public.vendors v where v.id::text = (storage.foldername(name))[1]));
create policy vendor_catalog_insert on storage.objects for insert to authenticated
with check (bucket_id = 'vendor-catalogs' and public.is_member()
  and exists (select 1 from public.vendors v where v.id::text = (storage.foldername(name))[1]));
create policy vendor_catalog_delete on storage.objects for delete to authenticated
using (bucket_id = 'vendor-catalogs' and public.is_member()
  and exists (select 1 from public.vendors v where v.id::text = (storage.foldername(name))[1]));

create function public.set_vendor_catalog(p_vendor_id uuid, p_storage_path text, p_file_name text)
returns text language plpgsql security definer set search_path = public, storage as $$
declare previous_path text;
begin
  if not public.is_member() then
    raise exception 'Sign in with an active team account' using errcode = '42501';
  end if;
  if p_vendor_id is null then raise exception 'Choose a vendor'; end if;
  select catalog_path into previous_path from public.vendors where id = p_vendor_id for update;
  if not found then raise exception 'Vendor not found'; end if;
  if p_storage_path is null or length(coalesce(p_file_name, '')) > 200 or
     (p_storage_path <> '' and (
       p_storage_path !~ ('^' || p_vendor_id::text || '/[0-9a-f-]{36}[.](pdf|jpg|png|webp)$') or
       nullif(trim(p_file_name), '') is null or
       not exists (select 1 from storage.objects
                   where bucket_id = 'vendor-catalogs' and name = p_storage_path)
     )) then
    raise exception 'Upload a valid catalogue first';
  end if;
  update public.vendors set catalog_path = p_storage_path,
    catalog_name = case when p_storage_path = '' then '' else trim(p_file_name) end
  where id = p_vendor_id;
  return previous_path;
end $$;
revoke all on function public.set_vendor_catalog(uuid, text, text) from public, anon;
grant execute on function public.set_vendor_catalog(uuid, text, text) to authenticated;
