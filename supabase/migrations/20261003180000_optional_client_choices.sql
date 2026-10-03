alter table public.documents
  add column client_choice_enabled boolean not null default false;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.crm_mutate(text,jsonb,uuid)'::regprocedure) into definition;
  if position('terms,quote_options,pricing_mode)' in definition) = 0
     or position('public.normalize_quote_options(p->''quote_options''),coalesce(p->>''pricing_mode'',''priced''))' in definition) = 0
     or position('pricing_mode=excluded.pricing_mode,' in definition) = 0
     or position('update documents set status=p->>''status'' where id=rid;' in definition) = 0 then
    raise exception 'Quotation mutation has changed';
  end if;
  definition = replace(definition,
    'terms,quote_options,pricing_mode)',
    'terms,quote_options,pricing_mode,client_choice_enabled)');
  definition = replace(definition,
    'public.normalize_quote_options(p->''quote_options''),coalesce(p->>''pricing_mode'',''priced''))',
    'public.normalize_quote_options(p->''quote_options''),coalesce(p->>''pricing_mode'',''priced''),coalesce((p->>''client_choice_enabled'')::boolean,false))');
  definition = replace(definition,
    'pricing_mode=excluded.pricing_mode,',
    'pricing_mode=excluded.pricing_mode,client_choice_enabled=excluded.client_choice_enabled,');
  definition = replace(definition,
    'update documents set status=p->>''status'' where id=rid;',
    'if d.share_token is not null and p->>''status''=''Draft'' then raise exception ''Revoke the share link before returning to Draft''; end if;
     update documents set status=p->>''status'' where id=rid;');
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
    'pricing_mode',pricing_mode,'client_choice_enabled',client_choice_enabled)
  from public.documents where share_token = token and status <> 'Draft'
$$;

create or replace function public.select_quote_options(token uuid, choices jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare doc public.documents; group_row jsonb; selected_id text; saved jsonb = '{}'::jsonb;
begin
  select * into doc from public.documents
  where share_token = token and kind = 'quote' and status = 'Sent' for update;
  if not found then raise exception 'Quotation is no longer open for choices'; end if;
  if not doc.client_choice_enabled then raise exception 'Client option selection is disabled'; end if;
  if jsonb_typeof(choices) <> 'object'
     or (select count(*) from jsonb_object_keys(choices)) <> jsonb_array_length(doc.quote_options) then
    raise exception 'Choose one option for each group';
  end if;
  for group_row in select value from jsonb_array_elements(doc.quote_options) loop
    selected_id = choices->>(group_row->>'id');
    if selected_id is null or not exists(
      select 1 from jsonb_array_elements(group_row->'options') option_row
      where option_row->>'id' = selected_id
    ) then raise exception 'Choose one option for each group'; end if;
    saved = saved || jsonb_build_object(group_row->>'id', selected_id);
  end loop;
  update public.documents set quote_selections = saved, quote_selected_at = now()
  where id = doc.id;
  return jsonb_build_object('saved', true);
end $$;
