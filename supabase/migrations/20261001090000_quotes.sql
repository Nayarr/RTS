-- =============================================================================
-- RTS Atelier : Devis (bureau)
--   - devis sans OR : client et véhicule retrouvés ou créés à la volée ;
--   - réponse du client saisie par le bureau (accord oral, bon signé) ;
--   - devis accepté figé.
-- =============================================================================

-- Devis sans OR (demande de prix au comptoir, par téléphone…).
create or replace function public.create_quote(
  p_client_name text,
  p_plate text default null,
  p_vehicle_type public.vehicle_type default 'pl'
)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_vehicle public.vehicles;
  v_quote public.quotes;
begin
  perform public.assert_office();
  if coalesce(btrim(p_client_name), '') = '' then
    raise exception 'Indique le client' using errcode = '22023';
  end if;

  select id into v_client_id from public.clients where name_key = public.normalize_key(p_client_name);
  if v_client_id is null then
    insert into public.clients (name) values (btrim(p_client_name)) returning id into v_client_id;
  end if;

  if public.normalize_key(coalesce(p_plate, '')) <> '' then
    select * into v_vehicle from public.vehicles where plate_key = public.normalize_key(p_plate);
    if not found then
      insert into public.vehicles (plate, vehicle_type, client_id)
      values (upper(btrim(p_plate)), p_vehicle_type, v_client_id)
      returning * into v_vehicle;
    elsif v_vehicle.client_id is null then
      update public.vehicles set client_id = v_client_id where id = v_vehicle.id returning * into v_vehicle;
    end if;
  end if;

  insert into public.quotes (client_id, vehicle_id, vehicle_type, created_by)
  values (v_client_id, v_vehicle.id, coalesce(v_vehicle.vehicle_type, p_vehicle_type), auth.uid())
  returning * into v_quote;
  return v_quote;
end;
$$;

revoke execute on function public.create_quote(text, text, public.vehicle_type) from public, anon;
grant execute on function public.create_quote(text, text, public.vehicle_type) to authenticated;

-- Réponse du client enregistrée par le bureau : accepté, refusé, ou devis rouvert après un refus.
create or replace function public.set_quote_response(p_quote_id uuid, p_status public.quote_status)
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  perform public.assert_office();
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;

  if p_status in ('accepted', 'refused') then
    if v_quote.status in ('accepted', 'refused') then
      raise exception 'Le client a déjà répondu à ce devis' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.quote_lines where quote_id = p_quote_id and line_type <> 'text' and net_ht > 0) then
      raise exception 'Le devis est vide' using errcode = 'P0001';
    end if;
    perform public.assign_quote_number(p_quote_id, false);
    update public.quotes
       set status = p_status,
           accepted_at = case when p_status = 'accepted' then now() end,
           refused_at = case when p_status = 'refused' then now() end,
           response_processed_at = now()
     where id = p_quote_id
    returning * into v_quote;
  elsif p_status = 'in_progress' then
    if v_quote.status <> 'refused' then
      raise exception 'Seul un devis refusé peut être rouvert' using errcode = 'P0001';
    end if;
    update public.quotes set status = 'in_progress', refused_at = null where id = p_quote_id returning * into v_quote;
  else
    raise exception 'Réponse invalide' using errcode = '22023';
  end if;

  if v_quote.repair_order_id is not null then
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (v_quote.repair_order_id,
            'Devis ' || coalesce(v_quote.number, '') || case p_status
              when 'accepted' then ' accepté par le client'
              when 'refused' then ' refusé par le client'
              else ' rouvert'
            end,
            auth.uid());
  end if;
  return v_quote;
end;
$$;

revoke execute on function public.set_quote_response(uuid, public.quote_status) from public, anon;
grant execute on function public.set_quote_response(uuid, public.quote_status) to authenticated;

-- Devis accepté : ses lignes ne bougent plus (le client a donné son accord sur ce contenu).
create or replace function public.quote_lines_accepted_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
begin
  if not public.is_system_context()
     and exists (select 1 from public.quotes where id = v_quote_id and status = 'accepted') then
    raise exception 'Devis accepté : il ne peut plus être modifié' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.quote_lines_accepted_lock() from public, anon, authenticated;

create trigger quote_lines_accepted_lock
  before insert or update or delete on public.quote_lines
  for each row execute function public.quote_lines_accepted_lock();

-- Un devis modifié par le bureau passe « En cours » (il n'est plus un brouillon vide).
create or replace function public.quote_lines_mark_in_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quotes set status = 'in_progress' where id = new.quote_id and status = 'draft';
  return null;
end;
$$;

revoke execute on function public.quote_lines_mark_in_progress() from public, anon, authenticated;

create trigger quote_lines_mark_in_progress
  after insert on public.quote_lines
  for each row execute function public.quote_lines_mark_in_progress();

-- Liste des devis : client, véhicule et totaux en une lecture.
create view public.v_quotes_overview
with (security_invoker = on) as
select
  q.*,
  c.name as client_name,
  v.plate,
  r.number as repair_order_number,
  rr.number as resulting_repair_order_number,
  t.total_ht,
  t.total_vat,
  t.total_ttc
from public.quotes q
left join public.clients c on c.id = q.client_id
left join public.vehicles v on v.id = q.vehicle_id
left join public.repair_orders r on r.id = q.repair_order_id
left join public.repair_orders rr on rr.id = q.resulting_repair_order_id
join public.v_quote_totals t on t.quote_id = q.id;

revoke all on public.v_quotes_overview from public, anon;
grant select on public.v_quotes_overview to authenticated;
