alter table public.workspace_settings add column upi_id text not null default '';
alter table public.documents add column payment_qr_enabled boolean not null default false;

create function public.save_payment_upi(p_upi_id text)
returns void language plpgsql security definer set search_path = public as $$
declare vpa text := lower(trim(coalesce(p_upi_id, '')));
begin
  if not public.can_manage_users() then
    raise exception 'Owner or Admin access required' using errcode = '42501';
  end if;
  if length(vpa) > 120 or
     (vpa <> '' and vpa !~ '^[a-z0-9._-]+@[a-z0-9._-]+$') then
    raise exception 'Enter a valid business UPI ID';
  end if;
  update public.workspace_settings set upi_id = vpa;
end $$;
revoke all on function public.save_payment_upi(text) from public, anon;
grant execute on function public.save_payment_upi(text) to authenticated;

create function public.set_invoice_payment_qr(p_invoice_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare invoice public.documents; vpa text;
begin
  if not public.can_manage_users() then
    raise exception 'Owner or Admin access required' using errcode = '42501';
  end if;
  select * into invoice from public.documents
  where id = p_invoice_id and kind = 'invoice' for update;
  if not found or invoice.status not in ('Draft', 'Issued') then
    raise exception 'Current invoice not found';
  end if;
  if p_enabled is null then raise exception 'Choose whether to show the QR'; end if;
  if p_enabled then
    select upi_id into vpa from public.workspace_settings;
    if coalesce(vpa, '') = '' then raise exception 'Add a business UPI ID in Settings first'; end if;
    update public.documents set payment_qr_enabled = true,
      business = jsonb_set(business, '{upi_id}', to_jsonb(vpa), true)
    where id = p_invoice_id;
  else
    update public.documents set payment_qr_enabled = false,
      business = business - 'upi_id' where id = p_invoice_id;
  end if;
end $$;
revoke all on function public.set_invoice_payment_qr(uuid, boolean) from public, anon;
grant execute on function public.set_invoice_payment_qr(uuid, boolean) to authenticated;

-- The public document projection includes only the QR toggle and the UPI ID
-- already stored in its business snapshot, never unrelated workspace settings.
create or replace function public.shared_document(token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
 select jsonb_build_object('kind',kind,'ref',ref,'title',title,'status',status,
   'valid_until',valid_until,'issued_on',issued_on,'due_on',due_on,'tax_mode',tax_mode,
   'items',items,'subtotal',subtotal,'tax_amount',tax_amount,'total',total,
   'customer',customer,'business',business,'terms',terms,
   'payment_qr_enabled',payment_qr_enabled)
 from public.documents where share_token=token and status<>'Draft'
$$;
