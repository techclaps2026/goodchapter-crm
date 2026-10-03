alter table public.documents
  add column pricing_mode text not null default 'priced'
    check (pricing_mode in ('priced', 'selection'));
alter table public.documents
  add constraint selection_proposal_unpriced
    check (pricing_mode <> 'selection' or (kind = 'quote' and total = 0 and subtotal = 0 and tax_amount = 0 and status <> 'Accepted'));

create function public.selected_quote_items(groups jsonb, choices jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare group_row jsonb; option_row jsonb; result jsonb = '[]'::jsonb;
begin
  for group_row in select value from jsonb_array_elements(groups) loop
    select value into option_row from jsonb_array_elements(group_row->'options')
      where value->>'id' = choices->>(group_row->>'id') limit 1;
    if option_row is not null then
      result = result || jsonb_build_array(jsonb_build_object(
        'description', option_row->>'title',
        'quantity', (group_row->>'quantity')::integer,
        'unit_price', 0, 'discount_pct', 0, 'tax_rate', 0,
        'hsn', '', 'details', coalesce(option_row->>'details', ''),
        'category', coalesce(group_row->>'title', 'Other'),
        'image_path', coalesce(option_row->>'image_path', ''),
        'moq', null, 'notes', '', 'subtotal', 0, 'tax_amount', 0, 'total', 0));
    end if;
    option_row = null;
  end loop;
  if jsonb_array_length(result) = 0 then
    result = jsonb_build_array(jsonb_build_object(
      'description', 'Items to price', 'quantity', 1, 'unit_price', 0,
      'discount_pct', 0, 'tax_rate', 0, 'hsn', '', 'details', '',
      'category', 'Other', 'image_path', '', 'moq', null, 'notes', '',
      'subtotal', 0, 'tax_amount', 0, 'total', 0));
  end if;
  return result;
end $$;
revoke all on function public.selected_quote_items(jsonb,jsonb) from public, anon, authenticated;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.crm_mutate(text,jsonb,uuid)'::regprocedure) into definition;
  if position('calc=price_items(p->''items'',p->>''tax_mode'');' in definition) = 0
     or position('terms,quote_options)' in definition) = 0
     or position('terms=excluded.terms,quote_options=excluded.quote_options' in definition) = 0
     or position('d.terms,d.quote_options,d.id) returning id into rid;' in definition) = 0 then
    raise exception 'Quotation mutation has changed';
  end if;
  definition = replace(definition,
    'calc=price_items(p->''items'',p->>''tax_mode'');',
    'if coalesce(p->>''pricing_mode'',''priced'')=''selection'' then
     if p->>''tax_mode''<>''None'' or jsonb_typeof(p->''quote_options'')<>''array'' or jsonb_array_length(p->''quote_options'')<1 then raise exception ''Selection proposals need choices and no tax''; end if;
     if exists(select 1 from jsonb_array_elements(p->''quote_options'') g cross join lateral jsonb_array_elements(g->''options'') opt where (opt->>''unit_price'')::numeric<>0) then raise exception ''Selection proposals cannot contain prices''; end if;
     calc=price_items(jsonb_build_array(jsonb_build_object(''description'',''Selection proposal'',''quantity'',1,''unit_price'',0)),''None'');
    elsif coalesce(p->>''pricing_mode'',''priced'')=''priced'' then
     calc=price_items(p->''items'',p->>''tax_mode'');
    else raise exception ''Invalid quotation mode''; end if;');
  definition = replace(definition,
    'terms,quote_options)', 'terms,quote_options,pricing_mode)');
  definition = replace(definition,
    'public.normalize_quote_options(p->''quote_options''))',
    'public.normalize_quote_options(p->''quote_options''),coalesce(p->>''pricing_mode'',''priced''))');
  definition = replace(definition,
    'terms=excluded.terms,quote_options=excluded.quote_options,',
    'terms=excluded.terms,quote_options=excluded.quote_options,pricing_mode=excluded.pricing_mode,');
  definition = replace(definition,
    'if p->>''status'' not in (''Draft'',''Sent'',''Accepted'',''Rejected'') then raise exception ''Invalid quotation status''; end if;',
    'if p->>''status'' not in (''Draft'',''Sent'',''Accepted'',''Rejected'') then raise exception ''Invalid quotation status''; end if;
     if d.pricing_mode=''selection'' and p->>''status''=''Accepted'' then raise exception ''Create a priced quotation before accepting''; end if;
     if p->>''status'' in (''Sent'',''Accepted'') and d.total=0 and exists(select 1 from documents parent where parent.id=d.revision_of and parent.pricing_mode=''selection'') then raise exception ''Add prices before sending this quotation''; end if;');
  definition = replace(definition,
    'terms,quote_options,revision_of)', 'terms,quote_options,pricing_mode,revision_of)');
  definition = replace(definition,
    'd.terms,d.quote_options,d.id) returning id into rid;',
    'd.terms,case when d.pricing_mode=''selection'' then ''[]''::jsonb else d.quote_options end,''priced'',d.id) returning id into rid;
     if d.pricing_mode=''selection'' then
       update documents set items=public.selected_quote_items(d.quote_options,d.quote_selections),tax_mode=''None'',subtotal=0,tax_amount=0,total=0 where id=rid;
     end if;');
  definition = replace(definition,
    'if not found or d.status<>''Accepted'' then raise exception ''Accept the quotation first''; end if;',
    'if not found or d.status<>''Accepted'' then raise exception ''Accept the quotation first''; end if;
     if d.pricing_mode=''selection'' then raise exception ''Create a priced quotation first''; end if;');
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
    'pricing_mode',pricing_mode)
  from public.documents where share_token = token and status <> 'Draft'
$$;
