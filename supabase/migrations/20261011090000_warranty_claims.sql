-- =============================================================================
-- RTS Atelier : Garanties et retours de pièces
--   Suivi des pièces renvoyées au fournisseur (défaut, erreur de référence,
--   casse…) : À retourner → Envoyée → Acceptée / Refusée → Remboursée.
--   Un retour déclaré depuis une pièce d'OR reprend l'OR, le véhicule et le
--   client, et s'inscrit dans l'historique de l'OR.
-- =============================================================================

-- Rattachement : pièce d'OR → OR → véhicule et client.
create or replace function public.warranty_claims_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ro_line_id is not null then
    select l.repair_order_id into new.repair_order_id from public.ro_lines l where l.id = new.ro_line_id;
  end if;
  if new.repair_order_id is not null then
    select coalesce(new.vehicle_id, ro.vehicle_id), coalesce(new.client_id, ro.client_id)
      into new.vehicle_id, new.client_id
    from public.repair_orders ro where ro.id = new.repair_order_id;
  end if;
  return new;
end;
$$;
revoke all on function public.warranty_claims_link() from public, anon, authenticated;

create trigger warranty_claims_link
  before insert or update of ro_line_id, repair_order_id on public.warranty_claims
  for each row execute function public.warranty_claims_link();

-- Historique de l'OR : « Retour / garantie déclaré : … »
create or replace function public.warranty_claims_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.repair_order_id is not null then
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (new.repair_order_id, 'Retour / garantie déclaré : ' || new.part_name, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.warranty_claims_log() from public, anon, authenticated;

create trigger warranty_claims_log
  after insert on public.warranty_claims
  for each row execute function public.warranty_claims_log();

-- Liste du bureau : fournisseur, OR, véhicule et client lisibles.
create view public.v_warranty_claims
with (security_invoker = on) as
select
  w.*,
  s.name as supplier_name,
  ro.number as repair_order_number,
  v.plate as vehicle_plate,
  c.name as client_name
from public.warranty_claims w
left join public.suppliers s on s.id = w.supplier_id
left join public.repair_orders ro on ro.id = w.repair_order_id
left join public.vehicles v on v.id = w.vehicle_id
left join public.clients c on c.id = w.client_id;

revoke all on public.v_warranty_claims from public, anon;
grant select on public.v_warranty_claims to authenticated;
