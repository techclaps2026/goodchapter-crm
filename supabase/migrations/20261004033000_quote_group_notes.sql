create or replace function public.normalize_quote_options(raw jsonb) returns jsonb
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
       or length(coalesce(group_row->>'note', '')) > 500
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
      'note', coalesce(group_row->>'note', ''),
      'quantity', (group_row->>'quantity')::integer, 'options', options));
  end loop;
  return groups;
end $$;
