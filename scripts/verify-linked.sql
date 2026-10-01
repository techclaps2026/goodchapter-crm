-- Run with: supabase db query --linked --file scripts/verify-linked.sql
-- Real Supabase schemas and roles, no emails, no persistent test records.
-- PostgreSQL sequences may advance even though all records are rolled back.
begin;
do $$
<<qa>>
declare
  owner_id uuid = gen_random_uuid();
  staff_id uuid = gen_random_uuid();
  admin_id uuid = gen_random_uuid();
  co_owner_id uuid = gen_random_uuid();
  client_id uuid; quote_id uuid; order_id uuid; invoice_id uuid; token uuid;
  result jsonb; first_payment jsonb; retry_key uuid = gen_random_uuid();
  rejected boolean; n integer;
begin
  insert into auth.users(id, raw_user_meta_data, invited_at)
  values (owner_id, '{"full_name":"Transactional QA owner"}', now()),
         (staff_id, '{"full_name":"Transactional QA staff"}', now()),
         (admin_id, '{"full_name":"Transactional QA admin"}', now()),
         (co_owner_id, '{"full_name":"Transactional QA co-owner"}', now());
  update public.profiles set role='owner' where id=owner_id;
  update public.profiles set role='admin' where id=admin_id;
  update public.profiles set role='co_owner' where id=co_owner_id;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  assert public.is_owner(), 'Owner profile could not be provisioned';
  client_id = (public.crm_mutate('save_client', '{"name":"Rollback QA","notes":"PRIVATE_QA_NOTE"}', gen_random_uuid())->>'id')::uuid;
  quote_id = (public.crm_mutate('save_quote', jsonb_build_object(
    'title','Transactional test','client_id',client_id,'tax_mode','CGST/SGST',
    'items','[{"description":"Cotton tee","quantity":80,"unit_price":650,"discount_pct":10,"tax_rate":18,"cost":12345},{"description":"Artwork setup","quantity":1,"unit_price":500,"tax_rate":18}]'::jsonb
  ), gen_random_uuid())->>'id')::uuid;
  assert (select total=55814 and not (items->0 ? 'cost') and not (customer ? 'notes') from public.documents where id=quote_id), 'Pricing or snapshot allowlist failed';
  perform public.crm_mutate('quote_status', jsonb_build_object('id',quote_id,'status','Accepted'), gen_random_uuid());
  order_id = (public.crm_mutate('convert_quote', jsonb_build_object('id',quote_id), gen_random_uuid())->>'id')::uuid;
  assert (public.crm_mutate('convert_quote', jsonb_build_object('id',quote_id), gen_random_uuid())->>'id')::uuid=order_id, 'Conversion duplicated order';
  rejected=false;
  begin
    perform public.crm_mutate('save_quote', jsonb_build_object('id',quote_id), gen_random_uuid());
  exception when others then rejected=true;
  end;
  assert rejected, 'Accepted quotation was editable';
  rejected=false;
  begin
    perform public.crm_mutate('save_order', jsonb_build_object('id',order_id,'status','Production','approval_not_required',false), gen_random_uuid());
  exception when others then rejected=true;
  end;
  assert rejected, 'Production allowed without artwork approval';
  perform public.crm_mutate('save_order', jsonb_build_object('id',order_id,'status','Production','approval_not_required',true,'required_date','2026-10-20'), gen_random_uuid());
  assert (select required_date='2026-10-20'::date from public.orders where id=order_id), 'Delivery deadline did not persist';
  invoice_id=(public.crm_mutate('create_invoice', jsonb_build_object('id',order_id,'due_on','2026-10-20'), gen_random_uuid())->>'id')::uuid;
  perform public.crm_mutate('issue_invoice', jsonb_build_object('id',invoice_id,'due_on','2026-10-20'), gen_random_uuid());
  first_payment=public.crm_mutate('log_payment',jsonb_build_object('order_id',order_id,'amount',20000,'kind','Receipt','method','Bank Transfer','payment_date','2026-10-01'),retry_key);
  assert public.crm_mutate('log_payment',jsonb_build_object('order_id',order_id,'amount',20000,'kind','Receipt','method','Bank Transfer','payment_date','2026-10-01'),retry_key)=first_payment, 'Payment retry duplicated';
  perform public.crm_mutate('log_payment',jsonb_build_object('order_id',order_id,'amount',35814,'kind','Receipt','method','Bank Transfer','payment_date','2026-10-01'),gen_random_uuid());
  assert (select sum(amount)=55814 and count(*)=2 from public.payments where payments.order_id=qa.order_id), 'Settlement failed';
  perform public.crm_mutate('save_cost',jsonb_build_object('order_id',order_id,'item_index',0,'amount',12345),gen_random_uuid());
  assert (select count(*)=1 from public.order_costs where order_costs.order_id=qa.order_id), 'Owner cost read failed';
  perform set_config('request.jwt.claim.sub',staff_id::text,true);
  assert not public.is_owner() and public.is_member(), 'Staff role failed';
  assert (select count(*)=0 from public.order_costs), 'Staff can read costs';
  rejected=false;
  begin
    perform public.crm_mutate('save_cost',jsonb_build_object('order_id',order_id,'item_index',0,'amount',1),gen_random_uuid());
  exception when insufficient_privilege then rejected=true;
  end;
  assert rejected, 'Staff can write costs';
  rejected=false;
  begin
    update public.profiles set role='owner' where id=staff_id;
  exception when insufficient_privilege then rejected=true;
  end;
  assert rejected, 'Direct role escalation permitted';
  perform set_config('request.jwt.claim.sub',co_owner_id::text,true);
  assert public.is_owner() and not public.can_manage_users(), 'Co-owner permissions failed';
  assert (select count(*)=1 from public.order_costs), 'Co-owner cannot read costs';
  rejected=false;
  begin
    perform public.crm_mutate('update_user',jsonb_build_object('id',staff_id,'full_name','QA staff','role','admin','active',true),gen_random_uuid());
  exception when insufficient_privilege then rejected=true;
  end;
  assert rejected, 'Co-owner can manage users';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  assert public.can_manage_users(), 'Admin cannot manage users';
  perform public.crm_mutate('update_user',jsonb_build_object('id',staff_id,'full_name','QA staff','role','staff','active',true),gen_random_uuid());
  perform public.set_team_user_removed(staff_id,true);
  assert (select not active and deleted_at is not null from public.profiles where id=staff_id), 'User removal did not revoke access';
  assert (select count(*)=1 from public.profiles where id=staff_id), 'User removal erased audit identity';
  perform public.set_team_user_removed(staff_id,false);
  assert (select not active and deleted_at is null from public.profiles where id=staff_id), 'Restored user was activated without review';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.crm_mutate('share_document',jsonb_build_object('id',invoice_id,'enabled',true),gen_random_uuid());
  select share_token into token from public.documents where id=invoice_id;
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub','',true);
  result=public.shared_document(token);
  assert result->>'ref' is not null and not (result ? 'client_id') and not (result ? 'share_token') and result::text not like '%PRIVATE_QA_NOTE%', 'Public document leak';
  rejected=false;
  begin
    select count(*) into n from public.clients;
  exception when insufficient_privilege then rejected=true;
  end;
  assert rejected, 'Anonymous internal read permitted';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.crm_mutate('share_document',jsonb_build_object('id',invoice_id,'enabled',false),gen_random_uuid());
  assert public.shared_document(token) is null, 'Share revocation failed';
  perform public.crm_mutate('save_order',jsonb_build_object('id',order_id,'status','Cancelled','approval_not_required',true),gen_random_uuid());
  assert (select count(*)=2 from public.payments where payments.order_id=qa.order_id), 'Cancellation removed payment history';
  execute 'reset role';
end $$;
rollback;
select 'PASS: live role, removal, pricing, immutability, approval gate, idempotency, settlement and sharing checks; all test rows rolled back' as verification;
