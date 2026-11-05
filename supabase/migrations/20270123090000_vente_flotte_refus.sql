-- =============================================================================
-- Vente d'un véhicule loué ou prêté : le refus nomme le contrat, son état et ce qu'il faut faire
--
-- Le refus disait « location en cours ou réservée » même pour un contrat « À facturer » ou un prêt,
-- qu'on ne retrouvait pas dans la liste des contrats en cours.
-- =============================================================================

create or replace function public.sell_fleet_vehicle(
  p_vehicle_id uuid,
  p_client_id uuid,
  p_sold_at timestamptz,
  p_mileage integer,
  p_vat_scheme text,
  p_price numeric,
  p_purchase_price numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.fleet_vehicles;
  v_rate numeric := coalesce((select default_vat_rate from public.company_settings), 20);
  v_margin boolean := p_vat_scheme = 'margin';
  v_title text;
  v_invoice_id uuid;
  v_rental public.rentals;
  v_loan boolean;
begin
  perform public.assert_office();
  select * into v_vehicle from public.fleet_vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'Véhicule introuvable' using errcode = 'P0002';
  end if;
  if v_vehicle.sold_on is not null then
    raise exception 'Ce véhicule est déjà vendu' using errcode = 'P0001';
  end if;
  select * into v_rental from public.rentals
   where fleet_vehicle_id = p_vehicle_id and status in ('reserved', 'active', 'returned')
   order by departure_at
   limit 1;
  if found then
    v_loan := v_rental.kind = 'loan';
    raise exception 'Vente impossible : % % (%). %',
      case when v_loan then 'prêt' else 'location' end,
      case v_rental.status
        when 'reserved' then case when v_loan then 'prévu' else 'réservée' end
        when 'active' then 'en cours'
        else 'à facturer'
      end,
      v_rental.number,
      case v_rental.status
        when 'reserved' then case when v_loan then 'Annule-le d''abord.' else 'Annule-la d''abord.' end
        when 'active' then case when v_loan then 'Enregistre le retour puis clôture-le.'
                                else 'Enregistre le retour puis clôture-la.' end
        else case when v_loan then 'Clôture-le d''abord.' else 'Clôture-la d''abord.' end
      end
      using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and archived_at is null) then
    raise exception 'Client introuvable ou archivé' using errcode = 'P0002';
  end if;
  if p_vat_scheme is null or p_vat_scheme not in ('normal', 'margin') then
    raise exception 'Régime de TVA invalide' using errcode = '22023';
  end if;
  if coalesce(p_price, 0) <= 0 then
    raise exception 'Indique le prix de vente' using errcode = '22023';
  end if;
  if v_margin and coalesce(p_purchase_price, -1) < 0 then
    raise exception 'Indique le prix d''achat : la TVA sur la marge en dépend' using errcode = '22023';
  end if;

  v_title := v_vehicle.brand || ' ' || v_vehicle.model;
  insert into public.invoices (client_id, vehicle_label, service_date, mileage, created_by,
                               vat_scheme, margin_purchase_price, margin_vat_rate, vat_exempt_mention)
  values (p_client_id, v_vehicle.plate || ' · ' || v_title, public.paris_date(p_sold_at), p_mileage, auth.uid(),
          p_vat_scheme,
          case when v_margin then p_purchase_price end,
          case when v_margin then v_rate end,
          case when v_margin then 'TVA sur la marge : régime particulier - biens d''occasion (articles 297 A et 297 E du CGI). TVA non récupérable par l''acquéreur.' end)
  returning id into v_invoice_id;
  -- Pas de « Fournitures et recyclage » sur la vente d'un véhicule
  delete from public.invoice_lines where invoice_id = v_invoice_id;
  insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
  values (v_invoice_id, 0, 'vehicle',
          'Vente véhicule d''occasion ' || v_title || ' · ' || v_vehicle.plate || coalesce(
            E'\n' || nullif(concat_ws(' · ',
              case when v_vehicle.vin is not null then 'N° de série ' || v_vehicle.vin end,
              case when v_vehicle.first_registration is not null
                   then 'Mise en circulation le ' || to_char(v_vehicle.first_registration, 'DD/MM/YYYY') end,
              case when p_mileage is not null then p_mileage || ' km' end), ''), ''),
          round(p_price, 2), 1, case when v_margin then 0 else v_rate end);

  insert into public.fleet_vehicle_sales (fleet_vehicle_id, client_id, invoice_id, sold_at, mileage, vat_scheme,
                                          sale_price, purchase_price)
  values (p_vehicle_id, p_client_id, v_invoice_id, p_sold_at, p_mileage, p_vat_scheme,
          round(p_price, 2), case when v_margin then p_purchase_price end);
  update public.fleet_vehicles
     set is_active = false, sold_on = public.paris_date(p_sold_at), mileage = coalesce(p_mileage, mileage)
   where id = p_vehicle_id;
  return v_invoice_id;
end;
$$;
