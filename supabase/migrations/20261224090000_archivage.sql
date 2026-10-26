-- =============================================================================
-- Archives : clients et véhicules mis de côté, suppression d'un véhicule sans historique
--
-- Demande du client : pouvoir retirer des fiches client et véhicule. Une fiche qui a un historique
-- (OR, devis, factures : à garder 10 ans) s'archive : elle sort des listes, de la recherche et
-- des suggestions, reste ouverte depuis son lien, se restaure depuis Réglages › Archives. Un client
-- archivé emporte ses véhicules (restaurés avec lui). Un nouvel OR ressort la fiche des archives.
-- Une fiche sans historique se supprime (direction).
-- =============================================================================

alter table public.clients add column archived_at timestamptz;
alter table public.vehicles add column archived_at timestamptz;
comment on column public.clients.archived_at is 'Archivé : hors des listes et de la recherche (historique gardé).';
comment on column public.vehicles.archived_at is 'Archivé : hors des listes et de la recherche (historique gardé).';

-- Archiver ou restaurer un client (direction) : ses véhicules le suivent
create function public.set_client_archived(p_client_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients;
  v_at timestamptz := clock_timestamp();
begin
  perform public.assert_direction();
  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client introuvable' using errcode = 'P0002';
  end if;
  if p_archived and v_client.archived_at is null then
    update public.clients set archived_at = v_at where id = p_client_id;
    update public.vehicles set archived_at = v_at where client_id = p_client_id and archived_at is null;
  elsif not p_archived and v_client.archived_at is not null then
    -- Véhicules archivés avec le client (même instant) : restaurés avec lui
    update public.vehicles set archived_at = null
     where client_id = p_client_id and archived_at = v_client.archived_at;
    update public.clients set archived_at = null where id = p_client_id;
  end if;
end;
$$;
revoke execute on function public.set_client_archived(uuid, boolean) from public, anon;
grant execute on function public.set_client_archived(uuid, boolean) to authenticated;

create function public.set_vehicle_archived(p_vehicle_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_direction();
  update public.vehicles
     set archived_at = case when p_archived then coalesce(archived_at, clock_timestamp()) end
   where id = p_vehicle_id;
  if not found then
    raise exception 'Véhicule introuvable' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.set_vehicle_archived(uuid, boolean) from public, anon;
grant execute on function public.set_vehicle_archived(uuid, boolean) to authenticated;

-- Nouvel OR sur une fiche archivée : elle revient dans les listes
create function public.repair_orders_unarchive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.vehicles set archived_at = null where id = new.vehicle_id and archived_at is not null;
  update public.clients set archived_at = null where id = new.client_id and archived_at is not null;
  return null;
end;
$$;
revoke execute on function public.repair_orders_unarchive() from public, anon;
create trigger repair_orders_unarchive
  after insert on public.repair_orders
  for each row execute function public.repair_orders_unarchive();

-- Listes : fiches archivées repérables
create or replace view public.v_clients_overview
with (security_invoker = on) as
 SELECT c.id,
    c.name,
    c.name_key,
    c.email,
    c.phone,
    c.billing_address,
    c.siret,
    c.discount_percent,
    c.hourly_rate,
    c.portal_token,
    c.notes,
    c.legacy_key,
    c.created_at,
    c.updated_at,
    c.contact_name,
    c.other_phones,
    c.kind,
    c.civility,
    c.first_name,
    c.last_name,
    c.birth_date,
    c.birth_place,
    c.account_type,
    COALESCE(v.count, 0::bigint) AS vehicles_count,
    COALESCE(r.count, 0::bigint) AS orders_count,
    r.last_visit,
    COALESCE(i.revenue_ht, 0::numeric) AS revenue_ht,
    COALESCE(i.balance_due, 0::numeric) AS balance_due,
    COALESCE(i.overdue_count, 0::bigint) AS overdue_invoices_count,
    c.archived_at
   FROM clients c
     LEFT JOIN LATERAL ( SELECT count(*) AS count
           FROM vehicles
          WHERE vehicles.client_id = c.id) v ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS count,
            max(repair_orders.created_at) AS last_visit
           FROM repair_orders
          WHERE repair_orders.client_id = c.id) r ON true
     LEFT JOIN LATERAL ( SELECT sum(t.total_ht) AS revenue_ht,
            sum(GREATEST(b.balance_due, 0::numeric)) AS balance_due,
            count(*) FILTER (WHERE b.payment_status = 'overdue'::text) AS overdue_count
           FROM invoices inv
             JOIN v_invoice_totals t ON t.invoice_id = inv.id
             LEFT JOIN v_invoice_balances b ON b.invoice_id = inv.id
          WHERE inv.client_id = c.id AND inv.status = 'issued'::invoice_status) i ON true;

create or replace view public.v_vehicles_overview
with (security_invoker = on) as
 SELECT v.id,
    v.plate,
    v.plate_key,
    v.client_id,
    v.vehicle_type,
    v.brand,
    v.model,
    v.vin,
    v.first_registration_date,
    v.ct_due_date,
    v.tailgate_due_date,
    v.registration_doc_file_id,
    v.notes,
    v.created_at,
    v.updated_at,
    v.antipollution_due_date,
    c.name AS client_name,
    COALESCE(r.count, 0::bigint) AS orders_count,
    r.last_visit,
    m.mileage AS last_mileage,
    v.archived_at
   FROM vehicles v
     LEFT JOIN clients c ON c.id = v.client_id
     LEFT JOIN LATERAL ( SELECT count(*) AS count,
            max(repair_orders.created_at) AS last_visit
           FROM repair_orders
          WHERE repair_orders.vehicle_id = v.id) r ON true
     LEFT JOIN LATERAL ( SELECT repair_orders.mileage
           FROM repair_orders
          WHERE repair_orders.vehicle_id = v.id AND repair_orders.mileage IS NOT NULL
          ORDER BY repair_orders.created_at DESC
         LIMIT 1) m ON true;

-- Recherche globale : sans les fiches archivées
CREATE OR REPLACE FUNCTION public.global_search(p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
declare
  v_text text := btrim(coalesce(p_query, ''));
  v_like text;
  v_key text := public.normalize_key(p_query);
  v_key_like text;
begin
  if not public.is_office() then
    raise exception 'Accès refusé : réservé au bureau' using errcode = '42501';
  end if;

  if char_length(v_text) < 2 then
    return jsonb_build_object('repair_orders', '[]'::jsonb, 'clients', '[]'::jsonb, 'vehicles', '[]'::jsonb,
                              'quotes', '[]'::jsonb, 'invoices', '[]'::jsonb);
  end if;

  -- % et _ saisis sont cherchés tels quels.
  v_like := '%' || replace(replace(replace(v_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  -- Clé vide (saisie sans lettre ni chiffre) : ne correspond à rien.
  v_key_like := case when v_key = '' then null else '%' || v_key || '%' end;

  return jsonb_build_object(
    'repair_orders', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select r.id, r.number, r.status, r.created_at, v.plate, c.name as client_name
        from public.repair_orders r
        join public.vehicles v on v.id = r.vehicle_id
        left join public.clients c on c.id = r.client_id
        where public.normalize_key(r.number) like v_key_like
           or v.plate_key like v_key_like
           or c.name ilike v_like
        order by r.created_at desc
        limit 8
      ) x
    ), '[]'::jsonb),
    'clients', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.name)
      from (
        select c.id, c.name, c.phone, c.email
        from public.clients c
        where (c.name ilike v_like or c.name_key like v_key_like) and c.archived_at is null
        order by c.name
        limit 8
      ) x
    ), '[]'::jsonb),
    'vehicles', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.plate)
      from (
        select v.id, v.plate, v.vehicle_type, v.brand, v.model, c.name as client_name
        from public.vehicles v
        left join public.clients c on c.id = v.client_id
        where v.plate_key like v_key_like and v.archived_at is null
        order by v.plate
        limit 8
      ) x
    ), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select q.id, q.number, q.status, q.created_at, v.plate, c.name as client_name
        from public.quotes q
        left join public.vehicles v on v.id = q.vehicle_id
        left join public.clients c on c.id = q.client_id
        where public.normalize_key(q.number) like v_key_like
           or v.plate_key like v_key_like
           or c.name ilike v_like
        order by q.created_at desc
        limit 8
      ) x
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select i.id, i.number, i.status, i.created_at, i.issued_at, i.total_ttc, i.vehicle_label,
               coalesce(i.client_name, c.name) as client_name
        from public.invoices i
        left join public.clients c on c.id = i.client_id
        where public.normalize_key(i.number) like v_key_like
           or public.normalize_key(i.vehicle_label) like v_key_like
           or coalesce(i.client_name, c.name) ilike v_like
        order by i.created_at desc
        limit 8
      ) x
    ), '[]'::jsonb)
  );
end;
$$;
