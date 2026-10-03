alter table public.documents
  add constraint selection_proposal_has_choices
    check (pricing_mode <> 'selection' or jsonb_array_length(quote_options) > 0);
