-- Preserve the historical display for existing documents. New editors choose
-- their own setting, and revisions/invoices inherit the source document.
alter table public.documents
  add column show_discount boolean not null default true;

create function public.inherit_document_discount()
returns trigger language plpgsql security definer set search_path = public as $$
declare source_discount boolean;
begin
  if new.revision_of is not null then
    select show_discount into source_discount from public.documents where id = new.revision_of;
  elsif new.kind = 'invoice' and new.order_id is not null then
    select d.show_discount into source_discount
      from public.orders o join public.documents d on d.id = o.quote_id
      where o.id = new.order_id;
  end if;
  new.show_discount := coalesce(source_discount, new.show_discount);
  return new;
end $$;

create trigger inherit_document_discount
before insert on public.documents
for each row execute function public.inherit_document_discount();

do $$
declare definition text;
begin
  select pg_get_functiondef('public.crm_mutate(text,jsonb,uuid)'::regprocedure) into definition;
  if position(' elsif action=''quote_status'' then' in definition) = 0
     or position(' elsif action=''revise_invoice'' then' in definition) = 0 then
    raise exception 'Document mutation has changed';
  end if;
  definition = replace(definition,
    ' elsif action=''quote_status'' then',
    '  if p ? ''show_discount'' then
    if jsonb_typeof(p->''show_discount'') <> ''boolean'' then raise exception ''Invalid discount display setting''; end if;
    if (p->>''show_discount'')::boolean = false and exists (
      select 1 from jsonb_array_elements(p->''items'') item
      where coalesce((item->>''discount_pct'')::numeric, 0) <> 0
    ) then raise exception ''Hidden discounts must be zero''; end if;
    update documents set show_discount = (p->>''show_discount'')::boolean where id = rid;
   end if;
 elsif action=''quote_status'' then');
  definition = replace(definition,
    ' elsif action=''revise_invoice'' then',
    '  if p ? ''show_discount'' then
    if jsonb_typeof(p->''show_discount'') <> ''boolean'' then raise exception ''Invalid discount display setting''; end if;
    if (p->>''show_discount'')::boolean = false and exists (
      select 1 from jsonb_array_elements(p->''items'') item
      where coalesce((item->>''discount_pct'')::numeric, 0) <> 0
    ) then raise exception ''Hidden discounts must be zero''; end if;
    update documents set show_discount = (p->>''show_discount'')::boolean where id = rid;
   end if;
 elsif action=''revise_invoice'' then');
  execute definition;
end $$;

create or replace function public.shared_document(token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kind',kind,'ref',ref,'title',title,'status',status,
    'valid_until',valid_until,'issued_on',issued_on,'due_on',due_on,
    'tax_mode',tax_mode,'items',items,'subtotal',subtotal,
    'tax_amount',tax_amount,'total',total,'customer',customer,
    'business',business,'terms',terms,'payment_qr_enabled',payment_qr_enabled,
    'quote_options',quote_options,'quote_selections',quote_selections,
    'pricing_mode',pricing_mode,'client_choice_enabled',client_choice_enabled,
    'show_discount',show_discount)
  from public.documents where share_token = token and status <> 'Draft'
$$;
