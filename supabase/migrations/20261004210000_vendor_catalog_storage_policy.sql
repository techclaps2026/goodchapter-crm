-- Inside the vendor subquery, unqualified `name` resolves to vendors.name.
-- Check the folder of the storage object instead, for all catalogue actions.
drop policy vendor_catalog_read on storage.objects;
create policy vendor_catalog_read on storage.objects for select to authenticated
using (bucket_id = 'vendor-catalogs' and public.is_member()
  and exists (select 1 from public.vendors vendor
              where vendor.id::text = (storage.foldername(storage.objects.name))[1]));

drop policy vendor_catalog_insert on storage.objects;
create policy vendor_catalog_insert on storage.objects for insert to authenticated
with check (bucket_id = 'vendor-catalogs' and public.is_member()
  and exists (select 1 from public.vendors vendor
              where vendor.id::text = (storage.foldername(storage.objects.name))[1]));

drop policy vendor_catalog_delete on storage.objects;
create policy vendor_catalog_delete on storage.objects for delete to authenticated
using (bucket_id = 'vendor-catalogs' and public.is_member()
  and (public.can_manage_users() or
       exists (select 1 from public.vendors vendor
               where vendor.id::text = (storage.foldername(storage.objects.name))[1])));
