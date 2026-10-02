-- Owner/Admin record management; linked commercial records must be removed in dependency order.
do $$
declare definition text;
declare marker text := 'elsif action=''save_settings'' then';
begin
  select pg_get_functiondef('public.crm_mutate(text,jsonb,uuid)'::regprocedure) into definition;
  if position(marker in definition) = 0 then
    raise exception 'CRM mutation layout has changed';
  end if;
  execute replace(definition, marker, $branch$
 elsif action='update_payment' then
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if rid is null or not exists(select 1 from public.payments where id=rid) then raise exception 'Payment not found'; end if;
  if p->>'order_id' <> (select order_id::text from public.payments where id=rid)
     or p->>'kind' <> (select kind from public.payments where id=rid) then
    raise exception 'The order and entry type cannot be changed';
  end if;
  if (p->>'amount')::numeric <= 0 then raise exception 'Enter a positive amount'; end if;
  if p->>'kind'='Refund' and (p->>'amount')::numeric > coalesce((
    select sum(case when kind='Receipt' then amount else -amount end)
    from public.payments where order_id=(p->>'order_id')::uuid and id<>rid
  ),0) then raise exception 'Refund exceeds receipts'; end if;
  update public.payments set amount=(p->>'amount')::numeric,
    method=p->>'method', payment_date=(p->>'payment_date')::date,
    reference=coalesce(p->>'reference',''), notes=coalesce(p->>'notes','')
  where id=rid;
 elsif action='delete_record' then
  if not public.can_manage_users() then raise exception 'Owner or Admin access required' using errcode='42501'; end if;
  if rid is null then raise exception 'Choose a record'; end if;
  tbl=case p->>'kind'
    when 'client' then 'clients' when 'lead' then 'leads'
    when 'product' then 'products' when 'vendor' then 'vendors'
    when 'followup' then 'followups' when 'payment' then 'payments'
    when 'quote' then 'documents' when 'invoice' then 'documents'
    when 'order' then 'orders' else null end;
  if tbl is null then raise exception 'Unsupported record type'; end if;
  begin
    if p->>'kind'='order' then
      delete from public.order_vendors where order_id=rid;
      delete from public.order_costs where order_id=rid;
    end if;
    if p->>'kind' in ('quote','invoice') then
      delete from public.documents where id=rid and kind=p->>'kind';
    else
      execute format('delete from public.%I where id=$1',tbl) using rid;
    end if;
    get diagnostics idx = row_count;
    if idx=0 then raise exception 'Record not found'; end if;
  exception when foreign_key_violation then
    raise exception 'Remove linked invoices, payments, orders or follow-ups first';
  end;
 $branch$ || marker);
end $$;

-- Managers may clean up a deleted vendor's private catalogue object.
drop policy vendor_catalog_delete on storage.objects;
create policy vendor_catalog_delete on storage.objects for delete to authenticated
using (bucket_id = 'vendor-catalogs' and public.is_member()
  and (public.can_manage_users() or
       exists (select 1 from public.vendors v where v.id::text = (storage.foldername(name))[1])));
