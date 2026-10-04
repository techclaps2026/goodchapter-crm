create table public.quote_share_events (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  visit_id uuid not null,
  visitor_id uuid not null,
  event text not null check (event in ('open', 'scroll', 'pdf_click', 'option_click', 'choices_submit')),
  option_id uuid,
  scroll_percent smallint,
  created_at timestamptz not null default now(),
  constraint quote_share_event_details check (
    (event = 'scroll' and scroll_percent in (25, 50, 75, 100) and option_id is null)
    or (event = 'option_click' and option_id is not null and scroll_percent is null)
    or (event in ('open', 'pdf_click', 'choices_submit') and option_id is null and scroll_percent is null)
  )
);

create index quote_share_events_document_created on public.quote_share_events(document_id, created_at desc);
create unique index quote_share_events_one_open on public.quote_share_events(visit_id) where event = 'open';
create unique index quote_share_events_one_scroll_milestone on public.quote_share_events(visit_id, scroll_percent) where event = 'scroll';
alter table public.quote_share_events enable row level security;
revoke all on public.quote_share_events from anon, authenticated;

create function public.record_quote_share_event(
  p_token uuid, p_visit_id uuid, p_visitor_id uuid, p_event text,
  p_option_id uuid default null, p_scroll_percent smallint default null
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
    insert into public.quote_share_events(document_id, visit_id, visitor_id, event)
    values (d.id, p_visit_id, p_visitor_id, 'open') on conflict do nothing;
    return;
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
  elsif p_event <> 'pdf_click'
     or p_option_id is not null or p_scroll_percent is not null then
    raise exception 'Invalid engagement event';
  end if;

  insert into public.quote_share_events(document_id, visit_id, visitor_id, event, option_id, scroll_percent)
  values (d.id, p_visit_id, p_visitor_id, p_event, p_option_id, p_scroll_percent)
  on conflict do nothing;
end $$;

revoke all on function public.record_quote_share_event(uuid,uuid,uuid,text,uuid,smallint) from public;
grant execute on function public.record_quote_share_event(uuid,uuid,uuid,text,uuid,smallint) to anon, authenticated;

create function public.quote_share_stats(p_document_id uuid) returns jsonb
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
    ), '{}'::jsonb)
  ) into result from public.quote_share_events where document_id = p_document_id;
  return result;
end $$;

revoke all on function public.quote_share_stats(uuid) from public;
grant execute on function public.quote_share_stats(uuid) to authenticated;
