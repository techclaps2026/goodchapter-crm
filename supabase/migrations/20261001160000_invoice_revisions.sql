-- One current invoice per order; older issued versions remain as immutable
-- internal history when requirements change. Their share links are revoked.
alter table public.documents drop constraint documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('Draft', 'Sent', 'Accepted', 'Rejected', 'Issued', 'Superseded'));
alter table public.documents drop constraint documents_check;
alter table public.documents add constraint documents_check
  check ((kind='quote' and status in ('Draft','Sent','Accepted','Rejected'))
      or (kind='invoice' and status in ('Draft','Issued','Superseded')));
drop index public.one_invoice_per_order;
create unique index one_current_invoice_per_order on public.documents(order_id)
  where kind='invoice' and status<>'Superseded';

-- Reissue the mutation RPC with draft editing and versioned revisions. Keep all
-- existing operational branches and idempotency checks from the baseline.
create or replace function public.crm_mutate(action text,p jsonb,idempotency_key uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare rid uuid; result jsonb; calc jsonb; d documents; o orders; c clients; ws workspace_settings; old_status text; latest artwork; idx integer; isnew boolean; tbl text; allowed text[]; sets text; vals jsonb; begin
 if not is_member() then raise exception 'Sign in with an active team account' using errcode='42501'; end if;
 if idempotency_key is null then raise exception 'An idempotency key is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||idempotency_key::text,0));
 select m.result into result from mutation_keys m where m.actor_id=auth.uid() and m.key=idempotency_key;
 if found then return result; end if;
 rid=nullif(p->>'id','')::uuid;
 if action in ('save_client','save_lead','save_product','save_vendor','save_followup') then
  tbl=case action when 'save_client' then 'clients' when 'save_lead' then 'leads' when 'save_product' then 'products' when 'save_vendor' then 'vendors' else 'followups' end;
  allowed=case tbl
   when 'clients' then array['name','organisation','email','phone','billing_address','shipping_address','gstin','notes','archived']
   when 'leads' then array['name','organisation','email','phone','source','stage','brief','quantity','budget','required_date','assigned_to','client_id','notes']
   when 'products' then array['name','category','description','customisation','image_url','unit_price','archived']
   when 'vendors' then array['name','category','contact_name','email','phone','city','notes','archived']
   else array['title','lead_id','client_id','order_id','assigned_to','due_at','done','priority','notes'] end;
  if exists(select 1 from jsonb_object_keys(p) k where k<>all(allowed) and k<>'id') then raise exception 'Unexpected field'; end if;
  if rid is null then
   rid=gen_random_uuid();
   select string_agg(quote_ident(k),',') into sets from jsonb_object_keys(p) k where k=any(allowed);
   if sets is null then raise exception 'No fields supplied'; end if;
   execute format('insert into %I(id,%s) select $2,%s from jsonb_populate_record(null::%I,$1)',tbl,sets,sets,tbl) using p,rid;
  else
   execute format('select id from %I where id=$1 for update',tbl) into rid using rid;
   if rid is null then raise exception 'Record not found'; end if;
   select string_agg(format('%I=r.%I',k,k),',') into sets from jsonb_object_keys(p) k where k=any(allowed);
   if sets is null then raise exception 'No fields supplied'; end if;
   execute format('update %I t set %s from jsonb_populate_record(null::%I,$1) r where t.id=$2',tbl,sets,tbl) using p,rid;
  end if;
 elsif action='convert_lead' then
  perform 1 from leads where id=rid for update;
  perform 1 from leads where id=rid;
  if not found then raise exception 'Lead not found'; end if;
  select client_id into rid from leads where id=(p->>'id')::uuid;
  if rid is null then
   insert into clients(name,organisation,email,phone) select name,organisation,email,phone from leads where id=(p->>'id')::uuid returning id into rid;
   update leads set client_id=rid where id=(p->>'id')::uuid;
  end if;
 elsif action='save_quote' then
  if rid is not null then
   select * into d from documents where id=rid and kind='quote' for update;
   if not found or d.status='Accepted' then raise exception 'Accepted quotations are immutable; create a revision'; end if;
  end if;
  select * into c from clients where id=(p->>'client_id')::uuid;
  if not found then raise exception 'Client not found'; end if;
  if nullif(p->>'lead_id','') is not null and not exists(select 1 from leads where id=(p->>'lead_id')::uuid and client_id=c.id) then raise exception 'Lead must be linked to this client'; end if;
  select * into ws from workspace_settings;
  calc=price_items(p->'items',p->>'tax_mode');
  isnew=rid is null; rid=coalesce(rid,gen_random_uuid());
  insert into documents(id,kind,ref,title,client_id,lead_id,valid_until,tax_mode,items,subtotal,tax_amount,total,customer,business,terms)
  values(rid,'quote','Q-'||to_char(now(),'YYYY')||'-'||lpad(nextval('document_ref_seq')::text,4,'0'),p->>'title',c.id,nullif(p->>'lead_id','')::uuid,nullif(p->>'valid_until','')::date,p->>'tax_mode',calc->'items',(calc->>'subtotal')::numeric,(calc->>'tax_amount')::numeric,(calc->>'total')::numeric,
   jsonb_build_object('name',c.name,'organisation',c.organisation,'email',c.email,'phone',c.phone,'billing_address',c.billing_address,'shipping_address',c.shipping_address,'gstin',c.gstin),to_jsonb(ws)-'id',coalesce(p->>'terms',ws.terms))
  on conflict(id) do update set title=excluded.title,client_id=excluded.client_id,lead_id=excluded.lead_id,valid_until=excluded.valid_until,tax_mode=excluded.tax_mode,items=excluded.items,subtotal=excluded.subtotal,tax_amount=excluded.tax_amount,total=excluded.total,customer=excluded.customer,business=excluded.business,terms=excluded.terms;
 elsif action='quote_status' then
  select * into d from documents where id=rid and kind='quote' for update;
  if not found or d.status='Accepted' then raise exception 'Accepted quotations cannot be changed'; end if;
  if p->>'status' not in ('Draft','Sent','Accepted','Rejected') then raise exception 'Invalid quotation status'; end if;
  update documents set status=p->>'status' where id=rid;
  if p->>'status'='Sent' then update leads set stage='Quote Sent' where id=d.lead_id and stage not in ('Won','Lost'); end if;
 elsif action='revise_quote' then
  select * into d from documents where id=rid and kind='quote';
  if not found then raise exception 'Quotation not found'; end if;
  insert into documents(kind,ref,title,client_id,lead_id,valid_until,tax_mode,items,subtotal,tax_amount,total,customer,business,terms,revision_of)
  values('quote','Q-'||to_char(now(),'YYYY')||'-'||lpad(nextval('document_ref_seq')::text,4,'0'),d.title,d.client_id,d.lead_id,d.valid_until,d.tax_mode,d.items,d.subtotal,d.tax_amount,d.total,d.customer,d.business,d.terms,d.id) returning id into rid;
 elsif action='convert_quote' then
  select * into d from documents where id=rid and kind='quote' for update;
  if not found or d.status<>'Accepted' then raise exception 'Accept the quotation first'; end if;
  select id into rid from orders where quote_id=d.id;
  if rid is null then
   insert into orders(ref,title,quote_id,client_id,shipping_address,required_date) values('O-'||to_char(now(),'YYYY')||'-'||lpad(nextval('document_ref_seq')::text,4,'0'),d.title,d.id,d.client_id,coalesce(d.customer->>'shipping_address',''),(select required_date from leads where id=d.lead_id)) returning id into rid;
   update leads set stage='Won' where id=d.lead_id;
  end if;
 elsif action='save_order' then
  select * into o from orders where id=rid for update;
  if not found then raise exception 'Order not found'; end if;
  old_status=coalesce(p->>'status',o.status);
  if o.status='Cancelled' then raise exception 'Cancelled orders are read-only'; end if;
  select * into latest from artwork where order_id=rid order by version desc limit 1;
  if old_status in ('Production','Quality Check','Dispatched','Delivered') and not coalesce((p->>'approval_not_required')::boolean,o.approval_not_required) and (latest.id is null or latest.status<>'Approved') then raise exception 'Approve the latest artwork or explicitly mark approval not required'; end if;
  update orders set status=old_status,required_date=nullif(p->>'required_date','')::date,shipping_address=coalesce(p->>'shipping_address',shipping_address),courier=coalesce(p->>'courier',courier),tracking_ref=coalesce(p->>'tracking_ref',tracking_ref),dispatched_on=nullif(p->>'dispatched_on','')::date,delivered_on=nullif(p->>'delivered_on','')::date,approval_not_required=coalesce((p->>'approval_not_required')::boolean,approval_not_required),notes=coalesce(p->>'notes',notes) where id=rid;
 elsif action='assign_vendor' or action='save_cost' then
  select * into o from orders where id=(p->>'order_id')::uuid for update;
  if not found or o.status='Cancelled' then raise exception 'Order not available'; end if;
  idx=(p->>'item_index')::integer;
  if idx is null or idx<0 or idx>=jsonb_array_length((select items from documents where id=o.quote_id)) then raise exception 'Invalid item'; end if;
  if action='assign_vendor' then
   insert into order_vendors values(o.id,idx,nullif(p->>'vendor_id','')::uuid) on conflict(order_id,item_index) do update set vendor_id=excluded.vendor_id;
  else
   if not is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
   insert into order_costs values(o.id,idx,(p->>'amount')::numeric) on conflict(order_id,item_index) do update set amount=excluded.amount;
  end if; rid=o.id;
 elsif action='add_artwork' then
  select * into o from orders where id=(p->>'order_id')::uuid for update;
  if not found or o.status in ('Cancelled','Delivered') then raise exception 'Order not available'; end if;
  if p->>'storage_path' not like o.id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='artwork' and name=p->>'storage_path') then raise exception 'Upload the artwork before attaching it'; end if;
  insert into artwork(order_id,version,file_name,storage_path,notes) select o.id,coalesce(max(version),0)+1,p->>'file_name',p->>'storage_path',coalesce(p->>'notes','') from artwork where order_id=o.id returning id into rid;
  update orders set status='Design & Approval',approval_not_required=false where id=o.id;
 elsif action='review_artwork' then
  select * into latest from artwork where id=rid;
  if not found then raise exception 'Artwork not found'; end if;
  select * into o from orders where id=latest.order_id for update;
  if o.status in ('Cancelled','Delivered') then raise exception 'Order not available'; end if;
  if latest.version<>(select max(version) from artwork where order_id=o.id) then raise exception 'Only the latest version may be reviewed'; end if;
  update artwork set status=p->>'status',notes=coalesce(p->>'notes',notes),approved_at=case when p->>'status'='Approved' then now() end,approved_by=case when p->>'status'='Approved' then auth.uid() end where id=rid;
  if p->>'status'<>'Approved' then update orders set status='Design & Approval' where id=o.id; end if;
 elsif action='save_invoice' then
  select * into d from documents where id=rid and kind='invoice';
  if not found then raise exception 'Invoice not found'; end if;
  select * into o from orders where id=d.order_id for update;
  select * into d from documents where id=rid and kind='invoice' for update;
  if d.status<>'Draft' or o.status='Cancelled' then raise exception 'Only active draft invoices may be edited'; end if;
  calc=price_items(p->'items',p->>'tax_mode');
  update documents set title=p->>'title',tax_mode=p->>'tax_mode',items=calc->'items',
    subtotal=(calc->>'subtotal')::numeric,tax_amount=(calc->>'tax_amount')::numeric,
    total=(calc->>'total')::numeric,terms=coalesce(p->>'terms',''),
    due_on=nullif(p->>'due_on','')::date where id=rid;
 elsif action='revise_invoice' then
  select * into d from documents where id=rid and kind='invoice';
  if not found then raise exception 'Invoice not found'; end if;
  select * into o from orders where id=d.order_id for update;
  select * into d from documents where id=rid and kind='invoice' for update;
  if d.status<>'Issued' or o.status='Cancelled' then raise exception 'Only active issued invoices may be revised'; end if;
  update documents set status='Superseded',share_token=null where id=d.id;
  insert into documents(kind,ref,title,client_id,order_id,tax_mode,items,subtotal,tax_amount,total,
    customer,business,terms,due_on,revision_of)
  values('invoice',d.ref||'-R'||lpad(nextval('document_ref_seq')::text,4,'0'),d.title,
    d.client_id,d.order_id,d.tax_mode,d.items,d.subtotal,d.tax_amount,d.total,
    d.customer,d.business,d.terms,d.due_on,d.id) returning id into rid;
 elsif action='create_invoice' then
  select * into o from orders where id=rid for update;
  if not found or o.status='Cancelled' then raise exception 'Order not available'; end if;
  select * into d from documents where id=o.quote_id;
  select id into rid from documents where order_id=o.id and kind='invoice' and status<>'Superseded';
  if rid is null then
   insert into documents(kind,ref,title,client_id,order_id,tax_mode,items,subtotal,tax_amount,total,customer,business,terms,due_on)
   values('invoice','INV-'||to_char(now(),'YYYY')||'-'||lpad(nextval('document_ref_seq')::text,4,'0'),d.title,d.client_id,o.id,d.tax_mode,d.items,d.subtotal,d.tax_amount,d.total,d.customer,d.business,d.terms,nullif(p->>'due_on','')::date) returning id into rid;
  end if;
 elsif action='issue_invoice' then
  select * into d from documents where id=rid and kind='invoice' for update;
  if not found or d.status<>'Draft' then raise exception 'Only draft invoices may be issued'; end if;
  update documents set status='Issued',issued_on=(now() at time zone 'Asia/Kolkata')::date,due_on=nullif(p->>'due_on','')::date where id=rid;
 elsif action='share_document' then
  select * into d from documents where id=rid for update;
  if not found or d.status in ('Draft','Superseded') then raise exception 'Only current sent or issued documents may be shared'; end if;
  update documents set share_token=case when (p->>'enabled')::boolean then gen_random_uuid() else null end where id=rid;
 elsif action='log_payment' then
  select * into o from orders where id=(p->>'order_id')::uuid for update;
  if not found then raise exception 'Order not found'; end if;
  if p->>'kind'='Refund' and not is_owner() then raise exception 'Only the owner can record refunds'; end if;
  if p->>'kind'='Receipt' and o.status='Cancelled' then raise exception 'Cannot record a new receipt against a cancelled order'; end if;
  if p->>'kind'='Refund' and (p->>'amount')::numeric>coalesce((select sum(case when kind='Receipt' then amount else -amount end) from payments where order_id=o.id),0) then raise exception 'Refund exceeds receipts'; end if;
  insert into payments(order_id,amount,kind,method,payment_date,reference,notes,created_by) values(o.id,(p->>'amount')::numeric,p->>'kind',p->>'method',(p->>'payment_date')::date,coalesce(p->>'reference',''),coalesce(p->>'notes',''),auth.uid()) returning id into rid;
 elsif action='save_settings' then
  if not is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  update workspace_settings set company_name=p->>'company_name',email=p->>'email',phone=p->>'phone',address=p->>'address',gstin=p->>'gstin',bank_details=p->>'bank_details',terms=p->>'terms';
 elsif action='update_user' then
  if not is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if rid=auth.uid() then raise exception 'You cannot change your own access'; end if;
  update profiles set full_name=p->>'full_name',role=p->>'role',active=(p->>'active')::boolean where id=rid;
 else raise exception 'Unknown action'; end if;
 result=jsonb_build_object('id',rid);
 insert into audit_events(actor_id,action,record_id) values(auth.uid(),action,rid);
 insert into mutation_keys values(auth.uid(),idempotency_key,result);
 return result;
end $$;
