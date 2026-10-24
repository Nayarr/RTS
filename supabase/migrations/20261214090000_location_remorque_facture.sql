-- =============================================================================
-- Location : remorque sans photo du tableau de bord, facture dès la remise des clés
--
-- * Remorque : ni compteur ni carburant, donc pas de photo du tableau de bord au départ ni au retour.
-- * Facture de départ : à la remise des clés d'une location (ou d'un prêt facturable), la facture de
--   la période prévue est préparée en brouillon, à émettre au bureau. Au retour, la clôture ne
--   facture plus que les suppléments (km, carburant, retard, nettoyage, périodes de reconduction) :
--   ajoutés à la facture de départ si elle est encore en brouillon, sinon sur une facture à part.
-- =============================================================================

alter table public.rentals
  add column departure_invoice_id uuid references public.invoices (id) on delete set null,
  add column departure_invoiced_periods integer check (departure_invoiced_periods > 0);
comment on column public.rentals.departure_invoice_id is
  'Facture préparée à la remise des clés (période prévue).';
comment on column public.rentals.departure_invoiced_periods is
  'Périodes facturées au départ : la clôture ne facture que celles ajoutées ensuite (reconduction).';

create or replace function public.rental_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_last integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'reserved' then
      raise exception 'Un contrat commence toujours réservé' using errcode = '22023';
    end if;
    v_year := extract(year from public.paris_date(new.departure_at))::integer;
    insert into public.rental_sequences as s (kind, year, last_value) values (new.kind, v_year, 1)
    on conflict (kind, year) do update set last_value = s.last_value + 1
    returning last_value into v_last;
    new.number := case new.kind when 'rental' then 'LC-' else 'PR-' end
                  || v_year || '-' || lpad(v_last::text, 4, '0');
    return new;
  end if;

  if new.number is distinct from old.number or new.kind is distinct from old.kind then
    raise exception 'Le numéro et le type du contrat ne changent pas' using errcode = '22023';
  end if;
  -- Les changements de statut passent par les fonctions (départ, retour, clôture, annulation)
  if new.status is distinct from old.status
     and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' then
    raise exception 'Statut du contrat modifié seulement par le départ, le retour ou la clôture'
      using errcode = '42501';
  end if;
  -- Après le départ, les conditions et la période de départ sont figées (seuls retour prévu et notes bougent)
  if old.status <> 'reserved' and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' and (
       new.client_id, new.fleet_vehicle_id, new.driving_license_id, new.departure_at, new.rate_period,
       new.unit_price, new.periods, new.discount_percent, new.km_included, new.extra_km_price,
       new.fuel_price_per_liter, new.cleaning_fee, new.late_fee_per_hour, new.deposit, new.franchise,
       new.billable, new.signature_file_id, new.signed_at
     ) is distinct from (
       old.client_id, old.fleet_vehicle_id, old.driving_license_id, old.departure_at, old.rate_period,
       old.unit_price, old.periods, old.discount_percent, old.km_included, old.extra_km_price,
       old.fuel_price_per_liter, old.cleaning_fee, old.late_fee_per_hour, old.deposit, old.franchise,
       old.billable, old.signature_file_id, old.signed_at
     ) then
    raise exception 'Contrat déjà parti : les conditions ne se modifient plus' using errcode = '42501';
  end if;
  -- Facture de départ : posée seulement par la remise des clés
  if (new.departure_invoice_id, new.departure_invoiced_periods)
       is distinct from (old.departure_invoice_id, old.departure_invoiced_periods)
     and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' then
    raise exception 'La facture de départ est préparée à la remise des clés' using errcode = '42501';
  end if;
  if old.status in ('closed', 'cancelled')
     and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' then
    raise exception 'Contrat clôturé ou annulé : plus modifiable' using errcode = '42501';
  end if;

  if old.status = 'reserved' then
    -- Contrat signé dont les conditions changent avant le départ : à signer de nouveau.
    if old.signed_at is not null and new.signed_at is not distinct from old.signed_at and (
         new.client_id, new.fleet_vehicle_id, new.departure_at, new.planned_return_at, new.rate_period,
         new.unit_price, new.periods, new.discount_percent, new.km_included, new.extra_km_price,
         new.fuel_price_per_liter, new.cleaning_fee, new.late_fee_per_hour, new.deposit, new.deposit_mode,
         new.franchise, new.billable
       ) is distinct from (
         old.client_id, old.fleet_vehicle_id, old.departure_at, old.planned_return_at, old.rate_period,
         old.unit_price, old.periods, old.discount_percent, old.km_included, old.extra_km_price,
         old.fuel_price_per_liter, old.cleaning_fee, old.late_fee_per_hour, old.deposit, old.deposit_mode,
         old.franchise, old.billable
       ) then
      new.signature_file_id := null;
      new.signed_at := null;
      new.terms_accepted := false;
    end if;
    -- Signé au comptoir : le lien envoyé par e-mail n'a plus lieu d'être.
    if old.signed_at is null and new.signed_at is not null then
      update public.signature_requests set status = 'cancelled'
       where rental_id = new.id and status = 'pending';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.rental_missing(p_rental_id uuid, p_phase public.rental_phase)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_vehicle public.fleet_vehicles;
  v_license public.driving_licenses;
  v_inspection public.rental_inspections;
  v_missing text[] := '{}'::text[];
  v_reason text;
  v_slot public.rental_photo_slot;
  v_labels jsonb := '{"front": "Photo avant", "back": "Photo arrière", "left": "Photo côté gauche",
                      "right": "Photo côté droit", "dashboard": "Photo du tableau de bord"}'::jsonb;
  v_engine boolean;
begin
  if not public.is_office() then
    raise exception 'Accès refusé : réservé au bureau' using errcode = '42501';
  end if;
  select * into v_rental from public.rentals where id = p_rental_id;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  select * into v_vehicle from public.fleet_vehicles where id = v_rental.fleet_vehicle_id;
  v_engine := v_vehicle.category <> 'trailer';
  select * into v_inspection from public.rental_inspections where rental_id = p_rental_id and phase = p_phase;

  if p_phase = 'departure' then
    v_reason := public.fleet_vehicle_block_reason(v_vehicle, public.paris_date(v_rental.departure_at));
    if v_reason is not null then
      v_missing := v_missing || v_reason;
    end if;
  end if;

  if v_rental.kind = 'loan' then
    return v_missing;  -- prêt : photos et relevés conseillés, pas obligatoires
  end if;

  if p_phase = 'departure' then
    select * into v_license from public.driving_licenses where id = v_rental.driving_license_id;
    if not found or v_license.client_id <> v_rental.client_id then
      v_missing := v_missing || 'Permis de conduire scanné'::text;
    else
      v_reason := public.license_block_reason(v_license, v_vehicle.license_category,
                                              public.paris_date(v_rental.planned_return_at));
      if v_reason is not null then
        v_missing := v_missing || v_reason;
      end if;
    end if;
    if v_rental.signed_at is null or v_rental.signature_file_id is null then
      v_missing := v_missing || 'Signature du client'::text;
    end if;
  end if;

  -- Remorque : pas de tableau de bord (ni compteur, ni carburant)
  foreach v_slot in array case when v_engine then array['front', 'back', 'left', 'right', 'dashboard']
                               else array['front', 'back', 'left', 'right'] end::public.rental_photo_slot[] loop
    if not exists (select 1 from public.rental_photos p
                   where p.rental_id = p_rental_id and p.phase = p_phase and p.slot = v_slot) then
      v_missing := v_missing || (v_labels ->> v_slot::text);
    end if;
  end loop;

  if v_engine then
    if v_inspection.mileage is null then
      v_missing := v_missing || 'Kilométrage'::text;
    end if;
    if v_inspection.fuel_eighths is null then
      v_missing := v_missing || 'Niveau de carburant'::text;
    end if;
  end if;
  return v_missing;
end;
$$;

create or replace function public.start_rental(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_missing text[];
  v_vehicle public.fleet_vehicles;
  v_invoice_id uuid;
  v_vat numeric := (select default_vat_rate from public.company_settings);
begin
  perform public.assert_office();
  select * into v_rental from public.rentals where id = p_rental_id for update;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  if v_rental.status <> 'reserved' then
    raise exception 'Les clés de ce contrat ont déjà été remises' using errcode = 'P0001';
  end if;
  v_missing := public.rental_missing(p_rental_id, 'departure');
  if cardinality(v_missing) > 0 then
    raise exception 'Impossible de remettre les clés : %', array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;
  -- Location (ou prêt facturable) : facture préparée dès la remise des clés, à émettre au bureau ;
  -- la clôture ne facture ensuite que les suppléments (km, carburant, retard, nettoyage, prolongation)
  if v_rental.kind = 'rental' or v_rental.billable then
    select * into v_vehicle from public.fleet_vehicles where id = v_rental.fleet_vehicle_id;
    insert into public.invoices (client_id, vehicle_label, service_date, mileage, rental_id, created_by)
    values (v_rental.client_id, concat_ws(' · ', v_vehicle.plate, nullif(btrim(concat_ws(' ', v_vehicle.brand, v_vehicle.model)), '')),
            public.paris_date(now()),
            (select mileage from public.rental_inspections where rental_id = p_rental_id and phase = 'departure'),
            p_rental_id, auth.uid())
    returning id into v_invoice_id;
    insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
    values (v_invoice_id, 0, 'rental',
            case v_rental.kind when 'rental' then 'Location ' else 'Prêt ' end
              || concat_ws(' ', nullif(btrim(concat_ws(' ', v_vehicle.brand, v_vehicle.model)), ''), '· ' || v_vehicle.plate)
              || ' du ' || to_char(public.paris_date(now()), 'DD/MM/YYYY')
              || ' au ' || to_char(public.paris_date(v_rental.planned_return_at), 'DD/MM/YYYY'),
            round(v_rental.unit_price * (1 - v_rental.discount_percent / 100), 2), v_rental.periods,
            coalesce(v_vat, 20));
  end if;

  perform set_config('rts.rental_transition', 'on', true);
  update public.rentals set status = 'active', departed_at = now(),
    departure_invoice_id = v_invoice_id, departure_invoiced_periods = case when v_invoice_id is null then null else v_rental.periods end
   where id = p_rental_id;
  perform set_config('rts.rental_transition', '', true);
end;
$$;

create or replace function public.close_rental(p_rental_id uuid, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_vehicle public.fleet_vehicles;
  v_invoice_id uuid;
  v_line jsonb;
  v_position integer := 0;
  v_vat numeric := (select default_vat_rate from public.company_settings);
  v_departure public.invoices;
begin
  perform public.assert_office();
  select * into v_rental from public.rentals where id = p_rental_id for update;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  if v_rental.status <> 'returned' then
    raise exception 'Enregistre d’abord le retour du véhicule' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' then
    raise exception 'Lignes de facture invalides' using errcode = '22023';
  end if;
  select * into v_vehicle from public.fleet_vehicles where id = v_rental.fleet_vehicle_id;

  -- Facture de départ encore en brouillon : les suppléments s'y ajoutent (une seule facture)
  select * into v_departure from public.invoices where id = v_rental.departure_invoice_id;
  if jsonb_array_length(coalesce(p_lines, '[]')) > 0 and v_departure.status = 'draft' then
    v_invoice_id := v_departure.id;
    v_position := coalesce((select max(position) + 1 from public.invoice_lines where invoice_id = v_invoice_id), 0);
  elsif jsonb_array_length(coalesce(p_lines, '[]')) > 0 then
    insert into public.invoices (client_id, vehicle_label, service_date, mileage, rental_id, created_by)
    values (v_rental.client_id, v_vehicle.plate || ' · ' || v_vehicle.brand || ' ' || v_vehicle.model,
            public.paris_date(v_rental.returned_at),
            (select mileage from public.rental_inspections where rental_id = p_rental_id and phase = 'return'),
            p_rental_id, auth.uid())
    returning id into v_invoice_id;
  end if;

  if jsonb_array_length(coalesce(p_lines, '[]')) > 0 then
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if btrim(coalesce(v_line ->> 'description', '')) = '' then
        raise exception 'Chaque ligne a besoin d’une désignation' using errcode = '22023';
      end if;
      insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
      values (v_invoice_id, v_position, 'rental', btrim(v_line ->> 'description'),
              round((v_line ->> 'unit_price')::numeric, 2), (v_line ->> 'quantity')::numeric,
              coalesce(v_vat, 20));
      v_position := v_position + 1;
    end loop;
  end if;

  perform set_config('rts.rental_transition', 'on', true);
  update public.rentals set status = 'closed', closed_at = now(),
    invoice_id = coalesce(v_invoice_id, v_rental.departure_invoice_id) where id = p_rental_id;
  perform set_config('rts.rental_transition', '', true);
  return coalesce(v_invoice_id, v_rental.departure_invoice_id);
end;
$$;

-- Vue recréée : facture de départ (r.* est figé à la création)
drop view public.v_rentals_overview;
create view public.v_rentals_overview
with (security_invoker = on) as
select
  r.*,
  c.name as client_name,
  c.kind as client_kind,
  c.phone as client_phone,
  v.plate,
  v.brand,
  v.model,
  v.category,
  ro.number as repair_order_number,
  i.number as invoice_number,
  di.number as departure_invoice_number,
  di.status as departure_invoice_status,
  (r.status = 'active' and r.planned_return_at < now()) as is_late,
  round(r.unit_price * r.periods * (1 - r.discount_percent / 100), 2) as estimated_ht
from public.rentals r
join public.clients c on c.id = r.client_id
join public.fleet_vehicles v on v.id = r.fleet_vehicle_id
left join public.repair_orders ro on ro.id = r.repair_order_id
left join public.invoices i on i.id = r.invoice_id
left join public.invoices di on di.id = r.departure_invoice_id;

revoke all on public.v_rentals_overview from public, anon;
grant select on public.v_rentals_overview to authenticated;
