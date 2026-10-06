-- Expenses are their own ledger, never columns on an order. An expense may
-- belong to an order, a vendor, both or neither, and reports by its own date
-- and category so it can feed order profitability and the P&L.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  vendor_id uuid references public.vendors(id),
  category text not null check (category in (
    'Procurement','Logistics','Samples','Packaging','Transportation','Printing','Miscellaneous')),
  amount numeric(14,2) not null check (amount > 0 and amount <= 100000000),
  expense_date date not null,
  payee text not null default '' check (length(payee) <= 200),
  payment_method text not null check (payment_method in (
    'UPI','Bank Transfer','Cash','Card','Cheque','Other')),
  description text not null default '' check (length(description) <= 2000),
  receipt_path text not null default '',
  receipt_name text not null default '' check (length(receipt_name) <= 200),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_order_id_idx on public.expenses(order_id) where order_id is not null;
create index expenses_vendor_id_idx on public.expenses(vendor_id) where vendor_id is not null;
create index expenses_date_idx on public.expenses(expense_date);
create index expenses_category_date_idx on public.expenses(category, expense_date);

-- Expenses reveal costs and margins: Owner, Co-owner and Admin only, like order_costs.
alter table public.expenses enable row level security;
revoke all on public.expenses from anon, authenticated;
grant select on public.expenses to authenticated;
create policy owner_read on public.expenses for select to authenticated
  using (public.is_owner());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
create policy expense_receipt_read on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and public.is_owner());
create policy expense_receipt_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and public.is_owner()
    and name ~ '^[0-9a-f-]{36}[.](pdf|jpg|png|webp)$');
-- No update/delete policies: a receipt stays available as evidence for the ledger.

-- Writes stay on the idempotent, audited mutation path.
do $$
declare definition text;
declare marker text := ' elsif action=''delete_record'' then';
declare kinds text := 'when ''order'' then ''orders'' else null end';
declare linked text := 'Remove linked invoices, payments, orders or follow-ups first';
begin
  select pg_get_functiondef('public.crm_mutate(text,jsonb,uuid)'::regprocedure) into definition;
  if position(marker in definition) = 0 or position(kinds in definition) = 0
     or position(linked in definition) = 0 then
    raise exception 'CRM mutation layout has changed';
  end if;
  definition = replace(definition, kinds,
    'when ''order'' then ''orders'' when ''expense'' then ''expenses'' else null end');
  definition = replace(definition, linked,
    'Remove linked invoices, payments, expenses, orders or follow-ups first');
  definition = replace(definition, marker, $branch$ elsif action='save_expense' then
  if not is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if exists(select 1 from jsonb_object_keys(p) k where k <> all(array['id','order_id','vendor_id',
    'category','amount','expense_date','payee','payment_method','description','receipt_path','receipt_name']))
  then raise exception 'Unexpected field'; end if;
  if rid is not null then
    perform 1 from public.expenses where id=rid for update;
    if not found then raise exception 'Expense not found'; end if;
  end if;
  if nullif(p->>'order_id','') is not null
     and not exists(select 1 from public.orders where id=(p->>'order_id')::uuid) then
    raise exception 'Order not found';
  end if;
  if nullif(p->>'vendor_id','') is not null
     and not exists(select 1 from public.vendors where id=(p->>'vendor_id')::uuid) then
    raise exception 'Vendor not found';
  end if;
  if nullif(p->>'amount','') is null or (p->>'amount')::numeric <= 0
     or (p->>'amount')::numeric <> round((p->>'amount')::numeric, 2) then
    raise exception 'Enter a positive amount in rupees and paise';
  end if;
  if nullif(p->>'expense_date','') is null then raise exception 'Choose the expense date'; end if;
  if coalesce(p->>'receipt_path','') <> ''
     and (p->>'receipt_path') is distinct from (select receipt_path from public.expenses where id=rid)
     and ((p->>'receipt_path') !~ '^[0-9a-f-]{36}[.](pdf|jpg|png|webp)$'
       or not exists(select 1 from storage.objects
                     where bucket_id='expense-receipts' and name=p->>'receipt_path')) then
    raise exception 'Upload the receipt before attaching it';
  end if;
  if rid is null then
    insert into public.expenses(order_id,vendor_id,category,amount,expense_date,payee,payment_method,
      description,receipt_path,receipt_name,created_by)
    values(nullif(p->>'order_id','')::uuid, nullif(p->>'vendor_id','')::uuid, p->>'category',
      (p->>'amount')::numeric, (p->>'expense_date')::date, trim(coalesce(p->>'payee','')),
      p->>'payment_method', trim(coalesce(p->>'description','')), coalesce(p->>'receipt_path',''),
      case when coalesce(p->>'receipt_path','')='' then ''
           else coalesce(nullif(trim(p->>'receipt_name'),''),'Receipt') end,
      auth.uid())
    returning id into rid;
  else
    update public.expenses set order_id=nullif(p->>'order_id','')::uuid,
      vendor_id=nullif(p->>'vendor_id','')::uuid, category=p->>'category',
      amount=(p->>'amount')::numeric, expense_date=(p->>'expense_date')::date,
      payee=trim(coalesce(p->>'payee','')), payment_method=p->>'payment_method',
      description=trim(coalesce(p->>'description','')), receipt_path=coalesce(p->>'receipt_path',''),
      receipt_name=case when coalesce(p->>'receipt_path','')='' then ''
                        else coalesce(nullif(trim(p->>'receipt_name'),''),'Receipt') end,
      updated_at=now()
    where id=rid;
  end if;
$branch$ || marker);
  execute definition;
end $$;
