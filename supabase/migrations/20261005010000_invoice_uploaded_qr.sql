alter table public.workspace_settings
  add column payment_qr_path text not null default '';

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', true, 2097152, array['image/png', 'image/jpeg']);

create policy payment_qr_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'payment-qr');
create policy payment_qr_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-qr' and public.can_manage_users()
    and name ~ '^[0-9a-f-]{36}[.](png|jpg)$');

create or replace function public.save_payment_upi(p_upi_id text)
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
  update public.workspace_settings set upi_id = vpa where id = true;
end $$;

create function public.save_payment_qr_image(p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_users() then
    raise exception 'Owner or Admin access required' using errcode = '42501';
  end if;
  if p_path is null or (p_path <> '' and
    (p_path !~ '^[0-9a-f-]{36}[.](png|jpg)$' or not exists (
      select 1 from storage.objects where bucket_id = 'payment-qr' and name = p_path
    ))) then
    raise exception 'Upload a PNG or JPG payment QR first';
  end if;
  update public.workspace_settings set payment_qr_path = p_path where id = true;
end $$;
revoke all on function public.save_payment_qr_image(text) from public, anon;
grant execute on function public.save_payment_qr_image(text) to authenticated;

create or replace function public.set_invoice_payment_qr(p_invoice_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare invoice public.documents; vpa text; image_path text;
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
    select upi_id, payment_qr_path into vpa, image_path
      from public.workspace_settings where id = true;
    if coalesce(vpa, '') = '' and coalesce(image_path, '') = '' then
      raise exception 'Add a business UPI ID or upload a payment QR in Settings first';
    end if;
    update public.documents set payment_qr_enabled = true,
      business = jsonb_set(
        jsonb_set(business, '{upi_id}', to_jsonb(coalesce(vpa, '')), true),
        '{payment_qr_path}', to_jsonb(coalesce(image_path, '')), true)
      where id = p_invoice_id;
  else
    update public.documents set payment_qr_enabled = false,
      business = business - 'upi_id' - 'payment_qr_path' where id = p_invoice_id;
  end if;
end $$;
