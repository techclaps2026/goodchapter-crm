-- Sharing a selection proposal is the action that sends it for client review.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.crm_mutate(text,jsonb,uuid)'::regprocedure) into definition;
  if position('if not found or d.status in (''Draft'',''Superseded'') then raise exception ''Only current sent or issued documents may be shared''; end if;' in definition)=0
     or position('update documents set share_token=case when (p->>''enabled'')::boolean then gen_random_uuid() else null end where id=rid;' in definition)=0
  then raise exception 'Sharing mutation has changed'; end if;
  definition = replace(definition,
    'if not found or d.status in (''Draft'',''Superseded'') then raise exception ''Only current sent or issued documents may be shared''; end if;',
    'if not found or d.status=''Superseded'' then raise exception ''Only current sent or issued documents may be shared''; end if;
     if d.status=''Draft'' and (d.kind<>''quote'' or d.pricing_mode<>''selection'' or not (p->>''enabled'')::boolean) then
       raise exception ''Mark quotation sent or issue invoice before sharing''; end if;');
  definition = replace(definition,
    'update documents set share_token=case when (p->>''enabled'')::boolean then gen_random_uuid() else null end where id=rid;',
    'if d.status=''Draft'' then
       update documents set status=''Sent'',share_token=gen_random_uuid() where id=rid;
     else
       update documents set share_token=case when (p->>''enabled'')::boolean then gen_random_uuid() else null end where id=rid;
     end if;');
  execute definition;
end $$;
