alter table public.quote_share_events
  add column device_category text check (device_category in ('mobile', 'tablet', 'desktop')),
  add column browser_family text check (browser_family in ('Edge', 'Firefox', 'Chrome', 'Safari', 'Other')),
  add column country_code text check (country_code ~ '^[A-Z]{2}$'),
  add column region_code text check (region_code ~ '^[A-Z0-9]{1,3}$');

alter table public.quote_share_events drop constraint quote_share_events_event_check;
alter table public.quote_share_events drop constraint quote_share_event_details;
alter table public.quote_share_events add constraint quote_share_event_kind
  check (event in ('open', 'scroll', 'pdf_click', 'pdf_ready', 'option_click', 'choices_submit'));
alter table public.quote_share_events add constraint quote_share_event_details check (
  (event = 'scroll' and scroll_percent in (25, 50, 75, 100) and option_id is null)
  or (event = 'option_click' and option_id is not null and scroll_percent is null)
  or (event in ('open', 'pdf_click', 'pdf_ready', 'choices_submit')
      and option_id is null and scroll_percent is null)
);

drop function public.record_quote_share_event(uuid,uuid,uuid,text,uuid,smallint);
create function public.record_quote_share_event(
  p_token uuid, p_visit_id uuid, p_visitor_id uuid, p_event text,
  p_option_id uuid default null, p_scroll_percent smallint default null,
  p_device_category text default null, p_browser_family text default null,
  p_country_code text default null, p_region_code text default null
) returns void language plpgsql security definer set search_path = public as $$
declare d public.documents;
begin
  select * into d from public.documents
  where share_token = p_token and kind = 'quote' and status <> 'Draft';
  if not found then raise exception 'Quotation link is unavailable'; end if;

  if p_event = 'open' then
    if p_option_id is not null or p_scroll_percent is not null then
      raise exception 'Invalid engagement event';
    end if;
    insert into public.quote_share_events
      (document_id, visit_id, visitor_id, event, device_category, browser_family, country_code, region_code)
    values
      (d.id, p_visit_id, p_visitor_id, 'open', p_device_category, p_browser_family, p_country_code, p_region_code)
    on conflict do nothing;
    return;
  end if;

  if p_device_category is not null or p_browser_family is not null
     or p_country_code is not null or p_region_code is not null then
    raise exception 'Visit details belong on the open event';
  end if;
  if not exists (
    select 1 from public.quote_share_events
    where document_id = d.id and visit_id = p_visit_id
      and visitor_id = p_visitor_id and event = 'open'
  ) then raise exception 'Open the quotation before tracking activity'; end if;
  if (select count(*) from public.quote_share_events where visit_id = p_visit_id) >= 100 then
    return;
  end if;

  if p_event = 'option_click' then
    if p_scroll_percent is not null or d.status <> 'Sent'
       or not d.client_choice_enabled or p_option_id is null
       or not exists (
         select 1 from jsonb_array_elements(coalesce(d.quote_options, '[]'::jsonb)) as g,
                      jsonb_array_elements(g.value->'options') as o
         where o.value->>'id' = p_option_id::text
       ) then raise exception 'Invalid quotation option'; end if;
  elsif p_event = 'scroll' then
    if p_option_id is not null or p_scroll_percent is null
       or p_scroll_percent not in (25, 50, 75, 100) then
      raise exception 'Invalid scroll milestone';
    end if;
  elsif p_event = 'choices_submit' then
    if d.status <> 'Sent' or not d.client_choice_enabled
       or p_option_id is not null or p_scroll_percent is not null then
      raise exception 'Invalid engagement event';
    end if;
  elsif p_event not in ('pdf_click', 'pdf_ready')
     or p_option_id is not null or p_scroll_percent is not null then
    raise exception 'Invalid engagement event';
  end if;

  insert into public.quote_share_events(document_id, visit_id, visitor_id, event, option_id, scroll_percent)
  values (d.id, p_visit_id, p_visitor_id, p_event, p_option_id, p_scroll_percent)
  on conflict do nothing;
end $$;

revoke all on function public.record_quote_share_event(uuid,uuid,uuid,text,uuid,smallint,text,text,text,text) from public;
grant execute on function public.record_quote_share_event(uuid,uuid,uuid,text,uuid,smallint,text,text,text,text)
  to anon, authenticated;

create or replace function public.quote_share_stats(p_document_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'Not authorised';
  end if;
  if not exists (select 1 from public.documents where id = p_document_id and kind = 'quote') then
    raise exception 'Quotation not found';
  end if;
  select jsonb_build_object(
    'opens', count(*) filter (where event = 'open'),
    'unique_sessions', count(distinct visitor_id) filter (where event = 'open'),
    'pdf_clicks', count(*) filter (where event = 'pdf_click'),
    'pdf_started', count(*) filter (where event = 'pdf_ready'),
    'option_clicks', count(*) filter (where event = 'option_click'),
    'choices_submitted', count(*) filter (where event = 'choices_submit'),
    'scrolled_halfway', count(distinct visit_id) filter (where event = 'scroll' and scroll_percent >= 50),
    'reached_end', count(distinct visit_id) filter (where event = 'scroll' and scroll_percent = 100),
    'last_opened_at', max(created_at) filter (where event = 'open'),
    'option_clicks_by_id', coalesce((
      select jsonb_object_agg(option_id, clicks) from (
        select option_id, count(*) as clicks from public.quote_share_events
        where document_id = p_document_id and event = 'option_click' group by option_id
      ) by_option
    ), '{}'::jsonb),
    'devices', coalesce((
      select jsonb_object_agg(device, visits) from (
        select coalesce(device_category, 'unknown') as device, count(*) as visits
        from public.quote_share_events where document_id = p_document_id and event = 'open'
        group by coalesce(device_category, 'unknown')
      ) by_device
    ), '{}'::jsonb),
    'recent_visits', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.opened_at desc) from (
        select opened_at, device_category, browser_family, country_code, region_code,
               scroll_percent, pdf_started, option_clicks, choices_submitted
        from (
          select max(created_at) filter (where event = 'open') as opened_at,
                 max(device_category) filter (where event = 'open') as device_category,
                 max(browser_family) filter (where event = 'open') as browser_family,
                 max(country_code) filter (where event = 'open') as country_code,
                 max(region_code) filter (where event = 'open') as region_code,
                 coalesce(max(scroll_percent) filter (where event = 'scroll'), 0) as scroll_percent,
                 count(*) filter (where event = 'pdf_ready') as pdf_started,
                 count(*) filter (where event = 'option_click') as option_clicks,
                 count(*) filter (where event = 'choices_submit') as choices_submitted
          from public.quote_share_events where document_id = p_document_id
          group by visit_id
        ) visit_summary
        order by opened_at desc limit 20
      ) recent
    ), '[]'::jsonb)
  ) into result from public.quote_share_events where document_id = p_document_id;
  return result;
end $$;
