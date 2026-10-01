-- RLS helpers are needed only by signed-in callers. The profile trigger is
-- invoked by PostgreSQL, never directly through the public RPC endpoint.
revoke execute on function public.is_member() from public, anon;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_member(), public.is_owner() to authenticated;
revoke execute on function public.provision_profile() from public, anon, authenticated;

-- shared_document remains intentionally callable by anon: it returns only
-- the customer-facing allowlist for an active, unguessable share token.
