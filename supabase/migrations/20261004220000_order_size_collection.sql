create table public.order_size_forms (
  order_id uuid primary key references public.orders(id) on delete cascade,
  share_token uuid not null unique default gen_random_uuid(),
  enabled boolean not null default true,
  items text[] not null,
  entries jsonb not null default '[]'::jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint order_size_items_count check (cardinality(items) between 1 and 12),
  constraint order_size_entries_array check (jsonb_typeof(entries) = 'array')
);

alter table public.order_size_forms enable row level security;
revoke all on public.order_size_forms from anon, authenticated;
grant select on public.order_size_forms to authenticated;
create policy member_read on public.order_size_forms for select to authenticated
  using (public.is_member());

create function public.configure_order_sizes(
  p_order_id uuid, p_items text[], p_enabled boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; current_form public.order_size_forms; clean_items text[];
begin
  if not public.is_member() then
    raise exception 'Sign in with an active team account' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status = 'Cancelled' then raise exception 'Order not available'; end if;
  if p_items is null or cardinality(p_items) not between 1 and 12 or p_enabled is null then
    raise exception 'Add 1 to 12 items needing sizes';
  end if;
  select array_agg(trim(item) order by ord) into clean_items
    from unnest(p_items) with ordinality as listed(item, ord);
  if exists (select 1 from unnest(clean_items) item where length(item) not between 1 and 80)
     or (select count(distinct lower(item)) from unnest(clean_items) item) <> cardinality(clean_items) then
    raise exception 'Use distinct item names up to 80 characters';
  end if;
  select * into current_form from public.order_size_forms where order_id = p_order_id for update;
  if found and exists (
    select 1 from jsonb_array_elements(current_form.entries) entry
    where not (entry->>'item' = any(clean_items))
  ) then raise exception 'Remove entries for an item before removing it from the form'; end if;
  if current_form.order_id is null then
    insert into public.order_size_forms(order_id, items, enabled)
      values(p_order_id, clean_items, p_enabled);
  else
    update public.order_size_forms
      set items = clean_items, enabled = p_enabled,
          share_token = case when not current_form.enabled and p_enabled
                             then gen_random_uuid() else share_token end,
          updated_at = now()
      where order_id = p_order_id;
  end if;
  return (select jsonb_build_object('share_token', share_token, 'enabled', enabled,
    'items', items, 'entries', entries, 'version', version)
    from public.order_size_forms where order_id = p_order_id);
end $$;
revoke all on function public.configure_order_sizes(uuid,text[],boolean) from public, anon;
grant execute on function public.configure_order_sizes(uuid,text[],boolean) to authenticated;

create function public.shared_order_sizes(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('order_ref', o.ref, 'title', o.title,
    'items', f.items, 'entries', f.entries, 'version', f.version)
  from public.order_size_forms f join public.orders o on o.id = f.order_id
  where f.share_token = p_token and f.enabled and o.status <> 'Cancelled'
$$;
revoke all on function public.shared_order_sizes(uuid) from public;
grant execute on function public.shared_order_sizes(uuid) to anon, authenticated;

create function public.save_order_sizes(
  p_token uuid, p_entries jsonb, p_version integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.order_size_forms; row_data jsonb; clean_rows jsonb = '[]'::jsonb;
declare row_id uuid; item_name text; person_name text; phone text; print_name text; size_name text;
begin
  select form_row.* into f from public.order_size_forms form_row
    join public.orders o on o.id = form_row.order_id
    where form_row.share_token = p_token and form_row.enabled and o.status <> 'Cancelled' for update of form_row;
  if not found then raise exception 'This size form is no longer available'; end if;
  if p_version is distinct from f.version then
    raise exception 'The size sheet changed elsewhere. Reload before saving';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 500 then
    raise exception 'Submit up to 500 size entries';
  end if;
  for row_data in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(row_data) <> 'object' or
       coalesce(row_data->>'id','') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Invalid size entry';
    end if;
    row_id := (row_data->>'id')::uuid;
    item_name := trim(coalesce(row_data->>'item',''));
    person_name := trim(coalesce(row_data->>'name',''));
    phone := trim(coalesce(row_data->>'phone',''));
    print_name := trim(coalesce(row_data->>'print_name',''));
    size_name := trim(coalesce(row_data->>'size',''));
    if not (item_name = any(f.items)) or length(person_name) not between 1 and 100
       or length(phone) > 30 or length(print_name) > 80
       or length(size_name) not between 1 and 30 then
      raise exception 'Complete each name and size; keep entries within the field limits';
    end if;
    if exists (select 1 from jsonb_array_elements(clean_rows) prior
               where prior->>'id' = row_id::text) then
      raise exception 'Duplicate size entry';
    end if;
    clean_rows := clean_rows || jsonb_build_array(jsonb_build_object(
      'id', row_id, 'item', item_name, 'name', person_name,
      'phone', phone, 'print_name', print_name, 'size', size_name));
  end loop;
  update public.order_size_forms set entries = clean_rows,
    version = version + 1, updated_at = now() where order_id = f.order_id;
  return jsonb_build_object('saved', true, 'version', f.version + 1);
end $$;
revoke all on function public.save_order_sizes(uuid,jsonb,integer) from public;
grant execute on function public.save_order_sizes(uuid,jsonb,integer) to anon, authenticated;
