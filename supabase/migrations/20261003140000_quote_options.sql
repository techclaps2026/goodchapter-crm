alter table public.documents
  add column quote_options jsonb not null default '[]'::jsonb,
  add column quote_selections jsonb not null default '{}'::jsonb,
  add column quote_selected_at timestamptz;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('quote-options', 'quote-options', false, 4194304,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy quote_options_insert on storage.objects for insert to authenticated
with check (bucket_id = 'quote-options' and public.is_member()
  and (storage.foldername(name))[1] = auth.uid()::text);
create policy quote_options_read on storage.objects for select to authenticated
using (bucket_id = 'quote-options' and public.is_member());

create function public.normalize_quote_options(raw jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, storage as $$
declare group_row jsonb; option_row jsonb; groups jsonb = '[]'::jsonb;
        options jsonb; group_ids text[] = '{}'; option_ids text[];
        group_id text; option_id text; image_path text; price numeric;
begin
  if raw is null then return groups; end if;
  if jsonb_typeof(raw) <> 'array' or jsonb_array_length(raw) > 20 then
    raise exception 'Invalid quotation option groups';
  end if;
  for group_row in select value from jsonb_array_elements(raw) loop
    group_id = group_row->>'id';
    if group_id is null or group_id !~ '^[0-9a-f-]{36}$' or group_id = any(group_ids)
       or length(trim(coalesce(group_row->>'title', ''))) not between 1 and 120
       or (group_row->>'quantity')::integer not between 1 and 1000000
       or jsonb_typeof(group_row->'options') <> 'array'
       or jsonb_array_length(group_row->'options') not between 1 and 8 then
      raise exception 'Invalid quotation option group';
    end if;
    group_ids = array_append(group_ids, group_id);
    options = '[]'::jsonb; option_ids = '{}';
    for option_row in select value from jsonb_array_elements(group_row->'options') loop
      option_id = option_row->>'id'; image_path = coalesce(option_row->>'image_path', '');
      price = (option_row->>'unit_price')::numeric;
      if option_id is null or option_id !~ '^[0-9a-f-]{36}$' or option_id = any(option_ids)
         or length(trim(coalesce(option_row->>'title', ''))) not between 1 and 120
         or length(coalesce(option_row->>'details', '')) > 1000
         or price is null or price < 0 or price > 100000000 or price <> round(price, 2)
         or (image_path <> '' and (
           image_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
           or not exists(select 1 from storage.objects
                         where bucket_id = 'quote-options' and name = image_path)
         )) then
        raise exception 'Invalid quotation option';
      end if;
      option_ids = array_append(option_ids, option_id);
      options = options || jsonb_build_array(jsonb_build_object(
        'id', option_id, 'title', trim(option_row->>'title'),
        'details', coalesce(option_row->>'details', ''),
        'image_path', image_path, 'unit_price', price));
    end loop;
    groups = groups || jsonb_build_array(jsonb_build_object(
      'id', group_id, 'title', trim(group_row->>'title'),
      'quantity', (group_row->>'quantity')::integer, 'options', options));
  end loop;
  return groups;
end $$;
revoke all on function public.normalize_quote_options(jsonb) from public, anon, authenticated;

do $$
declare definition text;
declare previous text := '''category'',coalesce(i->>''category'',''Other''),''subtotal'',net';
begin
  select pg_get_functiondef('public.price_items(jsonb,text)'::regprocedure) into definition;
  if position(previous in definition) = 0 then
    raise exception 'Quotation line pricing has changed';
  end if;
  definition = replace(definition,
    'if p_mode=''None'' then rate=0; end if;',
    'if nullif(i->>''moq'','''') is not null and (i->>''moq'')::integer not between 1 and 1000000 then raise exception ''Invalid minimum order quantity''; end if; if p_mode=''None'' then rate=0; end if;');
  execute replace(definition, previous,
    '''category'',coalesce(i->>''category'',''Other''),''image_path'',coalesce(i->>''image_path'',''''),''moq'',nullif(i->>''moq'','''')::integer,''notes'',left(coalesce(i->>''notes'',''''),1000),''subtotal'',net');
end $$;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.crm_mutate(text,jsonb,uuid)'::regprocedure) into definition;
  if position('insert into documents(id,kind,ref,title,client_id,lead_id,valid_until,tax_mode,items,subtotal,tax_amount,total,customer,business,terms)' in definition) = 0
     or position('coalesce(p->>''terms'',ws.terms))' in definition) = 0
     or position('terms=excluded.terms;' in definition) = 0
     or position('insert into documents(kind,ref,title,client_id,lead_id,valid_until,tax_mode,items,subtotal,tax_amount,total,customer,business,terms,revision_of)' in definition) = 0 then
    raise exception 'Quotation mutation has changed';
  end if;
  definition = replace(definition,
    'insert into documents(id,kind,ref,title,client_id,lead_id,valid_until,tax_mode,items,subtotal,tax_amount,total,customer,business,terms)',
    'insert into documents(id,kind,ref,title,client_id,lead_id,valid_until,tax_mode,items,subtotal,tax_amount,total,customer,business,terms,quote_options)');
  definition = replace(definition,
    'coalesce(p->>''terms'',ws.terms))',
    'coalesce(p->>''terms'',ws.terms),public.normalize_quote_options(p->''quote_options''))');
  definition = replace(definition,
    'terms=excluded.terms;',
    'terms=excluded.terms,quote_options=excluded.quote_options,quote_selections=''{}''::jsonb,quote_selected_at=null;');
  definition = replace(definition,
    'insert into documents(kind,ref,title,client_id,lead_id,valid_until,tax_mode,items,subtotal,tax_amount,total,customer,business,terms,revision_of)',
    'insert into documents(kind,ref,title,client_id,lead_id,valid_until,tax_mode,items,subtotal,tax_amount,total,customer,business,terms,quote_options,revision_of)');
  definition = replace(definition,
    'd.customer,d.business,d.terms,d.id) returning id into rid;',
    'd.customer,d.business,d.terms,d.quote_options,d.id) returning id into rid;');
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
    'quote_options',quote_options,
    'quote_selections',quote_selections)
  from public.documents where share_token = token and status <> 'Draft'
$$;

create function public.select_quote_options(token uuid, choices jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare doc public.documents; group_row jsonb; selected_id text; saved jsonb = '{}'::jsonb;
begin
  select * into doc from public.documents
  where share_token = token and kind = 'quote' and status = 'Sent' for update;
  if not found then raise exception 'Quotation is no longer open for choices'; end if;
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
revoke all on function public.select_quote_options(uuid,jsonb) from public;
grant execute on function public.select_quote_options(uuid,jsonb) to anon, authenticated;
