-- Fresh, independent workspace. Never apply this migration to the reference apps.
create extension if not exists pgcrypto;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', role text not null default 'staff' check(role in ('owner','staff')),
 active boolean not null default false, created_at timestamptz not null default now()
);
create or replace function public.provision_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name,active) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.invited_at is not null); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.provision_profile();
create function public.is_member() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and active) $$;
create function public.is_owner() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and active and role='owner') $$;
create table public.workspace_settings (
 id boolean primary key default true check(id), company_name text not null default 'The Good Chapter',
 email text not null default 'hello@thegoodchapter.in', phone text not null default '', address text not null default '',
 gstin text not null default '', logo_url text not null default '/logo.svg', bank_details text not null default '',
 terms text not null default 'Production begins after artwork approval. Delivery dates are confirmed with your order.'
);
insert into workspace_settings(id) values(true);
create table public.clients (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0), organisation text not null default '',
 email text not null default '', phone text not null default '', billing_address text not null default '', shipping_address text not null default '',
 gstin text not null default '', notes text not null default '', archived boolean not null default false, created_at timestamptz not null default now()
);
create table public.leads (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0), organisation text not null default '', email text not null default '', phone text not null default '',
 source text not null default 'Other' check(source in ('Website','Referral','Instagram','WhatsApp','Walk-in','Other')),
 stage text not null default 'New' check(stage in ('New','Contacted','Quote Sent','Follow-up','Won','Lost')),
 brief text not null default '', quantity integer check(quantity>0), budget numeric(14,2) check(budget>=0), required_date date,
 assigned_to uuid references profiles(id), client_id uuid references clients(id), notes text not null default '', created_at timestamptz not null default now()
);
create table public.products (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0), category text not null default 'Other', description text not null default '',
 customisation text not null default '', image_url text not null default '', unit_price numeric(14,2) not null default 0 check(unit_price>=0), archived boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.vendors (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0), category text not null default 'Other', contact_name text not null default '',
 email text not null default '', phone text not null default '', city text not null default '', notes text not null default '', archived boolean not null default false,
 created_at timestamptz not null default now()
);
create sequence public.document_ref_seq;
create table public.documents (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('quote','invoice')),
 ref text not null unique, title text not null check(length(trim(title))>0), client_id uuid not null references clients(id), lead_id uuid references leads(id),
 status text not null default 'Draft' check(status in ('Draft','Sent','Accepted','Rejected','Issued')),
 valid_until date, issued_on date, due_on date, tax_mode text not null default 'None' check(tax_mode in ('None','CGST/SGST','IGST')),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)>0),
 subtotal numeric(14,2) not null, tax_amount numeric(14,2) not null, total numeric(14,2) not null,
 customer jsonb not null, business jsonb not null, terms text not null default '',
 revision_of uuid references documents(id), share_token uuid unique, created_at timestamptz not null default now(),
 check((kind='quote' and status in ('Draft','Sent','Accepted','Rejected')) or (kind='invoice' and status in ('Draft','Issued')))
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), ref text not null unique, title text not null,
 quote_id uuid not null unique references documents(id), client_id uuid not null references clients(id),
 status text not null default 'Confirmed' check(status in ('Confirmed','Design & Approval','Production','Quality Check','Dispatched','Delivered','Cancelled')),
 required_date date, shipping_address text not null default '', courier text not null default '', tracking_ref text not null default '',
 dispatched_on date, delivered_on date, approval_not_required boolean not null default false,
 notes text not null default '', created_at timestamptz not null default now()
);
alter table documents add column order_id uuid references orders(id);
create unique index one_invoice_per_order on documents(order_id) where kind='invoice';
alter table documents add constraint invoice_requires_order check(kind<>'invoice' or order_id is not null);
create table public.order_vendors (
 order_id uuid not null references orders(id), item_index integer not null check(item_index>=0), vendor_id uuid references vendors(id), primary key(order_id,item_index)
);
create table public.order_costs (
 order_id uuid not null references orders(id), item_index integer not null check(item_index>=0), amount numeric(14,2) not null check(amount>=0),
 primary key(order_id,item_index)
);
create table public.artwork (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id), version integer not null check(version>0),
 file_name text not null, storage_path text not null unique, status text not null default 'Pending' check(status in ('Pending','Approved','Changes requested')),
 notes text not null default '', approved_at timestamptz, approved_by uuid references profiles(id), created_at timestamptz not null default now(), unique(order_id,version)
);
create table public.followups (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title))>0), lead_id uuid references leads(id), client_id uuid references clients(id),
 order_id uuid references orders(id), assigned_to uuid references profiles(id), due_at timestamptz not null, done boolean not null default false,
 priority text not null default 'Medium' check(priority in ('High','Medium','Low')), notes text not null default '', created_at timestamptz not null default now()
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id), amount numeric(14,2) not null check(amount>0),
 kind text not null default 'Receipt' check(kind in ('Receipt','Refund')), method text not null check(method in ('UPI','Bank Transfer','Cash','Card','Cheque','Other')),
 payment_date date not null, reference text not null default '', notes text not null default '', created_by uuid not null references profiles(id), created_at timestamptz not null default now()
);
create table public.audit_events (
 id bigint generated always as identity primary key, actor_id uuid references profiles(id), action text not null, record_id uuid, created_at timestamptz not null default now()
);
create table public.mutation_keys (actor_id uuid references profiles(id), key uuid, result jsonb not null, primary key(actor_id,key));

-- Browser/API reads obey RLS. Writes go only through the role-checked RPC.
do $$ declare t text; begin
 foreach t in array array['profiles','workspace_settings','clients','leads','products','vendors','documents','orders','order_vendors','artwork','followups','payments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy member_read on public.%I for select to authenticated using(public.is_member())',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['order_costs','audit_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(public.is_owner())',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
alter table mutation_keys enable row level security;
revoke all on mutation_keys from anon,authenticated;

-- Normalize into an allowlisted public line shape and calculate using decimals.
create function public.price_items(p_items jsonb,p_mode text) returns jsonb language plpgsql immutable set search_path=public as $$
declare i jsonb; line jsonb; lines jsonb='[]'; qty integer; price numeric; discount numeric; rate numeric; net numeric; tax numeric; sub numeric=0; taxes numeric=0; begin
 if p_mode not in ('None','CGST/SGST','IGST') or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Invalid items or tax mode'; end if;
 for i in select * from jsonb_array_elements(p_items) loop
  qty=(i->>'quantity')::integer; price=(i->>'unit_price')::numeric; discount=coalesce((i->>'discount_pct')::numeric,0); rate=coalesce((i->>'tax_rate')::numeric,0);
  if qty is null or qty<1 or qty>1000000 or price is null or price<0 or price>100000000 or price<>round(price,2) or discount<0 or discount>100 or rate<0 or rate>100 or length(trim(coalesce(i->>'description','')))=0 then raise exception 'Invalid line quantity, price, discount, tax or description'; end if;
  if p_mode='None' then rate=0; end if;
  net=round(qty*price*(1-discount/100),2);
  if p_mode='CGST/SGST' then tax=round(net*rate/200,2)*2; else tax=round(net*rate/100,2); end if;
  line=jsonb_build_object('description',i->>'description','quantity',qty,'unit_price',price,'discount_pct',discount,'tax_rate',rate,'hsn',coalesce(i->>'hsn',''),'details',coalesce(i->>'details',''),'category',coalesce(i->>'category','Other'),'subtotal',net,'tax_amount',tax,'total',net+tax);
  lines=lines||jsonb_build_array(line); sub=sub+net; taxes=taxes+tax;
 end loop;
 return jsonb_build_object('items',lines,'subtotal',sub,'tax_amount',taxes,'total',sub+taxes);
end $$;

create function public.crm_mutate(action text,p jsonb,idempotency_key uuid) returns jsonb language plpgsql security definer set search_path=public as $$
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
 elsif action='create_invoice' then
  select * into o from orders where id=rid for update;
  if not found or o.status='Cancelled' then raise exception 'Order not available'; end if;
  select * into d from documents where id=o.quote_id;
  select id into rid from documents where order_id=o.id and kind='invoice';
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
  if not found or d.status='Draft' then raise exception 'Mark quotation sent or issue invoice before sharing'; end if;
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
revoke all on function public.crm_mutate(text,jsonb,uuid) from public,anon;
grant execute on function public.crm_mutate(text,jsonb,uuid) to authenticated;
revoke all on function public.price_items(jsonb,text) from public,anon;
grant execute on function public.price_items(jsonb,text) to authenticated;

-- A narrow read-only projection, never SELECT * from an exposed document.
create function public.shared_document(token uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('kind',kind,'ref',ref,'title',title,'status',status,'valid_until',valid_until,'issued_on',issued_on,'due_on',due_on,'tax_mode',tax_mode,'items',items,'subtotal',subtotal,'tax_amount',tax_amount,'total',total,'customer',customer,'business',business,'terms',terms)
 from documents where share_token=token and status<>'Draft'
$$;
revoke all on function public.shared_document(uuid) from public;
grant execute on function public.shared_document(uuid) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('artwork','artwork',false,4194304,array['image/png','image/jpeg','image/webp','application/pdf']);
create policy artwork_read on storage.objects for select to authenticated using(bucket_id='artwork' and public.is_member());
create policy artwork_insert on storage.objects for insert to authenticated with check(bucket_id='artwork' and public.is_member() and exists(select 1 from public.orders where id::text=(storage.foldername(name))[1] and status not in ('Cancelled','Delivered')));
-- No update/delete policies: an approved source file cannot be overwritten.
create index leads_stage on leads(stage);
create index followups_due on followups(due_at) where not done;
create index orders_due on orders(required_date);
create index payments_order on payments(order_id);
create index documents_client on documents(client_id);
