-- An invoice is a new commercial document, even when it comes from an older
-- quotation. Take the current business GSTIN when the invoice is created or
-- issued. Existing issued snapshots remain unchanged; revisions are new rows.
create function public.invoice_current_gstin()
returns trigger language plpgsql security definer set search_path = public as $$
declare current_gstin text;
begin
  if new.kind <> 'invoice' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'Draft' or new.status <> 'Issued' then return new; end if;
  end if;
  select nullif(trim(gstin), '') into current_gstin from public.workspace_settings;
  if current_gstin is not null then
    new.business := jsonb_set(new.business, '{gstin}', to_jsonb(current_gstin), true);
  end if;
  return new;
end $$;

create trigger invoice_current_gstin
before insert or update of status on public.documents
for each row execute function public.invoice_current_gstin();
