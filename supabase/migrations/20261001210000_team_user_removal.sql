-- Keep historical assignments, approvals and payment attribution when a team
-- member is removed. Active membership is checked on every CRM request.
alter table public.profiles add column deleted_at timestamptz;
alter table public.profiles add constraint removed_profile_inactive
  check (deleted_at is null or not active);

create function public.set_team_user_removed(p_target uuid, p_removed boolean)
returns void language plpgsql security definer set search_path=public as $$
declare target public.profiles;
begin
  if not public.can_manage_users() then
    raise exception 'User management requires Owner or Admin access' using errcode='42501';
  end if;
  if p_target is null or p_target=auth.uid() then
    raise exception 'You cannot remove your own account' using errcode='42501';
  end if;
  select * into target from public.profiles where id=p_target for update;
  if not found then raise exception 'User not found'; end if;

  if p_removed and target.deleted_at is null then
    update public.profiles set active=false, deleted_at=now() where id=p_target;
    insert into public.audit_events(actor_id,action,record_id)
    values(auth.uid(),'remove_user',p_target);
  elsif not p_removed and target.deleted_at is not null then
    -- Restore to inactive; a manager must explicitly reactivate access.
    update public.profiles set deleted_at=null where id=p_target;
    insert into public.audit_events(actor_id,action,record_id)
    values(auth.uid(),'restore_user',p_target);
  end if;
end $$;
revoke all on function public.set_team_user_removed(uuid,boolean) from public, anon;
grant execute on function public.set_team_user_removed(uuid,boolean) to authenticated;
