-- =============================================================================
-- RTS Atelier : Recherche globale (bureau)
--   Un seul champ : immatriculation, client, n° d'OR, de devis ou de facture.
--   Les plaques et numéros se comparent sans espaces ni tirets (« ab123 » trouve
--   « AB-123-CD ») ; les noms, sans tenir compte des majuscules.
--   8 résultats au plus par catégorie, les plus récents d'abord.
-- =============================================================================

create or replace function public.global_search(p_query text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
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
        where c.name ilike v_like or c.name_key like v_key_like
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
        where v.plate_key like v_key_like
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

revoke execute on function public.global_search(text) from public, anon;
grant execute on function public.global_search(text) to authenticated;
