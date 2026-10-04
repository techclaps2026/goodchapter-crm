-- An order may have up to 100 lines. Allow any of them to need a client size.
alter table public.order_size_forms drop constraint order_size_items_count;
alter table public.order_size_forms add constraint order_size_items_count
  check (cardinality(items) between 1 and 100);

create or replace function public.configure_order_sizes(
  p_order_id uuid, p_items text[], p_enabled boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders; current_form public.order_size_forms; clean_items text[];
begin
  if not public.is_member() then
    raise exception 'Sign in with an active team account' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status = 'Cancelled' then raise exception 'Order not available'; end if;
  if p_items is null or cardinality(p_items) not between 1 and 100 or p_enabled is null then
    raise exception 'Select 1 to 100 items needing sizes';
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
