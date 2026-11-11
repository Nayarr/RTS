-- Frais de stationnement : véhicule parti après la date prévue. Le bureau indique la date de départ
-- prévue (et celle du départ réel) ; un brouillon de facture est créé au tarif du type de véhicule,
-- réglable par la direction (Réglages › Facturation).

alter table public.company_settings
  add column parking_rate_pl numeric(10,2) not null default 30
    constraint company_settings_parking_rate_pl_check check (parking_rate_pl >= 0),
  add column parking_rate_vul numeric(10,2) not null default 15
    constraint company_settings_parking_rate_vul_check check (parking_rate_vul >= 0),
  add column parking_rate_remorque numeric(10,2) not null default 20
    constraint company_settings_parking_rate_remorque_check check (parking_rate_remorque >= 0);
comment on column public.company_settings.parking_rate_pl is 'Frais de stationnement HT par jour : poids lourd.';
comment on column public.company_settings.parking_rate_vul is 'Frais de stationnement HT par jour : véhicule utilitaire.';
comment on column public.company_settings.parking_rate_remorque is 'Frais de stationnement HT par jour : remorque.';

-- Brouillon de facture des jours de stationnement en trop (du lendemain de la date prévue au départ).
create function public.build_parking_invoice_draft(
  p_repair_order_id uuid,
  p_planned_date date,
  p_left_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_plate text;
  v_left date := coalesce(p_left_date, public.paris_date(now()));
  v_days integer;
  v_rate numeric;
  v_settings public.company_settings;
  v_invoice_id uuid;
begin
  perform public.assert_billing();
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;
  if v_ro.client_id is null then
    raise exception 'OR sans client : rattache d''abord le client' using errcode = 'P0001';
  end if;
  if p_planned_date is null then
    raise exception 'Indique la date de départ prévue' using errcode = 'P0001';
  end if;
  v_days := v_left - p_planned_date;
  if v_days <= 0 then
    raise exception 'Parti le % : pas de jour de stationnement en trop', to_char(v_left, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  select * into v_settings from public.company_settings;
  v_rate := case v_ro.vehicle_type
    when 'vul' then v_settings.parking_rate_vul
    when 'remorque' then v_settings.parking_rate_remorque
    else v_settings.parking_rate_pl
  end;
  select plate into v_plate from public.vehicles where id = v_ro.vehicle_id;

  insert into public.invoices (client_id, vehicle_label, mileage, service_date, created_by)
  values (v_ro.client_id, v_plate, v_ro.mileage, v_left, auth.uid())
  returning id into v_invoice_id;

  insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
  values (v_invoice_id, 0, 'package',
          'Frais de stationnement · OR ' || v_ro.number || ' · départ prévu le ' || to_char(p_planned_date, 'DD/MM/YYYY')
            || ', parti le ' || to_char(v_left, 'DD/MM/YYYY') || ' · ' || v_days || ' jour'
            || case when v_days > 1 then 's' else '' end,
          v_rate, v_days, v_settings.default_vat_rate);

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (v_ro.id, 'Frais de stationnement facturés : ' || v_days || ' jour' || case when v_days > 1 then 's' else '' end
                   || ' en trop', auth.uid());
  return v_invoice_id;
end;
$$;
revoke execute on function public.build_parking_invoice_draft(uuid, date, date) from public, anon;
grant execute on function public.build_parking_invoice_draft(uuid, date, date) to authenticated;

-- CGV : tarif selon le type de véhicule (texte d'origine seulement ; des CGV déjà modifiées par la
-- direction ne sont pas touchées).
update public.company_settings
   set invoice_terms = replace(
     invoice_terms,
     'des frais de stationnement de 30 € HT par jour seront facturés.',
     'des frais de stationnement seront facturés par jour, selon le type de véhicule : 30 € HT pour un '
       || 'poids lourd, 20 € HT pour une remorque, 15 € HT pour un véhicule utilitaire (tarifs affichés à l''atelier).')
 where invoice_terms like '%des frais de stationnement de 30 € HT par jour seront facturés.%';
