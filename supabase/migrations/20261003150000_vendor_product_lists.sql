alter table public.vendors
  add column social_links text not null default '',
  add column products_list text not null default '';

do $$
declare definition text;
declare previous text := 'when ''vendors'' then array[''name'',''category'',''subcategories'',''contact_name'',''email'',''phone'',''city'',''notes'',''archived'']';
begin
  select pg_get_functiondef('public.crm_mutate(text,jsonb,uuid)'::regprocedure) into definition;
  if position(previous in definition) = 0 then
    raise exception 'Vendor mutation allowlist has changed';
  end if;
  execute replace(definition, previous,
    'when ''vendors'' then array[''name'',''category'',''subcategories'',''social_links'',''products_list'',''contact_name'',''email'',''phone'',''city'',''notes'',''archived'']');
end $$;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'text/csv', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'vendor-catalogs';

do $$
declare definition text;
begin
  select pg_get_functiondef('public.add_vendor_catalog(uuid,text,text)'::regprocedure) into definition;
  if position('(pdf|jpg|png|webp)' in definition) = 0 then
    raise exception 'Vendor catalogue path validation has changed';
  end if;
  execute replace(definition, '(pdf|jpg|png|webp)', '(pdf|jpg|png|webp|csv|xls|xlsx)');
  select pg_get_functiondef('public.set_vendor_catalog(uuid,text,text)'::regprocedure) into definition;
  if position('(pdf|jpg|png|webp)' in definition) = 0 then
    raise exception 'Legacy vendor catalogue path validation has changed';
  end if;
  execute replace(definition, '(pdf|jpg|png|webp)', '(pdf|jpg|png|webp|csv|xls|xlsx)');
end $$;
