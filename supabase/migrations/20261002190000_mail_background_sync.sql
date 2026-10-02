-- The CRM mailbox is read via IMAP. pg_cron triggers the server-side importer
-- every minute so new messages arrive even when nobody has Mail center open.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- One-time, service-role-only installer. The caller passes a token derived
-- from the server key, never the service-role key itself. Vault encrypts it;
-- it is never included in a migration or cron job.
create function public.install_mail_sync_schedule(p_service_key text)
returns void
language plpgsql
security definer
set search_path = public, vault, cron, net, pg_temp
as $$
declare
  secret_id uuid;
begin
  if nullif(current_setting('request.jwt.claim.role', true), '') is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if length(p_service_key) < 32 then
    raise exception 'Invalid service key';
  end if;
  select id into secret_id from vault.secrets where name = 'mail_sync_service_key';
  if secret_id is null then
    perform vault.create_secret(p_service_key, 'mail_sync_service_key');
  else
    perform vault.update_secret(secret_id, p_service_key);
  end if;
  perform cron.schedule(
    'goodchapter-inbox-sync',
    '* * * * *',
    $job$
      select net.http_get(
        url := 'https://app.thegoodchapter.in/api/mail/sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'mail_sync_service_key'
          )
        ),
        timeout_milliseconds := 55000
      );
    $job$
  );
end;
$$;
revoke all on function public.install_mail_sync_schedule(text) from public, anon, authenticated;
grant execute on function public.install_mail_sync_schedule(text) to service_role;
