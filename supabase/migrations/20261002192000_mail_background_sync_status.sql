-- Operational check for the private mailbox schedule; no token is returned.
create function public.mail_sync_schedule_status()
returns jsonb
language sql
security definer
set search_path = public, cron, pg_temp
as $$
  select jsonb_build_object(
    'enabled', coalesce(j.active, false),
    'last_status', d.status,
    'last_end', d.end_time,
    'last_message', d.return_message
  )
  from (select 1) as anchor
  left join cron.job j on j.jobname = 'goodchapter-inbox-sync'
  left join lateral (
    select status, end_time, return_message
    from cron.job_run_details
    where jobid = j.jobid
    order by runid desc
    limit 1
  ) d on true;
$$;
revoke all on function public.mail_sync_schedule_status() from public, anon, authenticated;
grant execute on function public.mail_sync_schedule_status() to service_role;
