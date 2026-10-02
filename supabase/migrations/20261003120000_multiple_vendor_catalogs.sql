create table public.vendor_catalogs (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  created_at timestamptz not null default now()
);
create index vendor_catalogs_vendor_id_idx on public.vendor_catalogs(vendor_id);

-- Preserve catalogues uploaded before vendors supported multiple files.
insert into public.vendor_catalogs(vendor_id, storage_path, file_name)
select id, catalog_path, coalesce(nullif(catalog_name, ''), 'Catalogue')
from public.vendors where catalog_path <> ''
on conflict(storage_path) do nothing;

alter table public.vendor_catalogs enable row level security;
revoke all on public.vendor_catalogs from anon, authenticated;
grant select on public.vendor_catalogs to authenticated;
create policy member_read on public.vendor_catalogs for select to authenticated
using(public.is_member());

create function public.add_vendor_catalog(p_vendor_id uuid, p_storage_path text, p_file_name text)
returns uuid language plpgsql security definer set search_path = public, storage as $$
declare new_id uuid;
begin
  if not public.is_member() then
    raise exception 'Sign in with an active team account' using errcode = '42501';
  end if;
  if p_vendor_id is null or not exists (select 1 from public.vendors where id = p_vendor_id) then
    raise exception 'Vendor not found';
  end if;
  if p_storage_path is null or
     p_storage_path !~ ('^' || p_vendor_id::text || '/[0-9a-f-]{36}[.](pdf|jpg|png|webp)$') or
     nullif(trim(p_file_name), '') is null or length(p_file_name) > 200 or
     not exists (select 1 from storage.objects
                 where bucket_id = 'vendor-catalogs' and name = p_storage_path) then
    raise exception 'Upload a valid catalogue first';
  end if;
  insert into public.vendor_catalogs(vendor_id, storage_path, file_name)
  values(p_vendor_id, p_storage_path, trim(p_file_name)) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.add_vendor_catalog(uuid, text, text) from public, anon;
grant execute on function public.add_vendor_catalog(uuid, text, text) to authenticated;

create function public.remove_vendor_catalog(p_catalog_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare path text;
begin
  if not public.is_member() then
    raise exception 'Sign in with an active team account' using errcode = '42501';
  end if;
  select storage_path into path from public.vendor_catalogs where id = p_catalog_id for update;
  if not found then raise exception 'Catalogue not found'; end if;
  delete from public.vendor_catalogs where id = p_catalog_id;
  update public.vendors set catalog_path = '', catalog_name = ''
  where catalog_path = path;
  return path;
end $$;
revoke all on function public.remove_vendor_catalog(uuid) from public, anon;
grant execute on function public.remove_vendor_catalog(uuid) to authenticated;
