-- « Tâche à faire » d'un OR créé depuis un devis : une tâche par ligne au lieu d'une liste
-- séparée par des virgules (illisible dès qu'il y a plusieurs travaux).

create or replace function public.create_repair_order_from_quote(p_quote_id uuid, p_technician_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_ro_id uuid;
  v_summary text;
  v_standalone boolean;
begin
  perform public.assert_office();
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;

  v_standalone := v_quote.repair_order_id is null;
  if not v_standalone then
    if v_quote.status <> 'accepted' then
      raise exception 'Le devis doit être accepté avant de créer l''OR' using errcode = 'P0001';
    end if;
    if v_quote.resulting_repair_order_id is not null then
      raise exception 'Un OR a déjà été créé pour ce devis' using errcode = 'P0001';
    end if;
  end if;
  if v_quote.vehicle_id is null then
    raise exception 'Renseigne l''immatriculation avant de créer l''OR' using errcode = 'P0001';
  end if;
  if v_quote.merged_into_repair_order_id is not null then
    raise exception 'Ce devis a déjà été rattaché à un OR' using errcode = 'P0001';
  end if;

  select string_agg(split_part(description, E'\n', 1), E'\n' order by position) into v_summary
  from public.quote_lines where quote_id = p_quote_id and section = 'planned' and line_type <> 'text';

  insert into public.repair_orders (vehicle_id, client_id, vehicle_type, technician_id, requested_work,
                                    origin_repair_order_id, origin_quote_id)
  values (v_quote.vehicle_id, v_quote.client_id, v_quote.vehicle_type, p_technician_id,
          coalesce(nullif(v_summary, ''), 'Travaux issus du devis ' || coalesce(v_quote.number, '')),
          v_quote.repair_order_id, v_quote.id)
  returning id into v_ro_id;

  perform set_config('rts.system', 'on', true);
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, standard_hours,
                               billed_hours, labor_category, unit_price, quantity, discount_percent, package_id, part_id,
                               supplier_id, purchase_price, shipping_cost, brand, manufacturer_ref, oem_ref,
                               order_status, source_quote_line_id)
  select v_ro_id, 'planned', ql.position, ql.line_type, ql.description, ql.estimated_hours, ql.standard_hours,
         ql.billed_hours, ql.labor_category, ql.unit_price, ql.quantity, ql.discount_percent, ql.package_id, ql.part_id,
         ql.supplier_id, ql.purchase_price, ql.shipping_cost, ql.brand, ql.manufacturer_ref, ql.oem_ref,
         case when ql.line_type = 'part' then 'to_order'::public.part_order_status end, ql.id
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.section = 'planned' and ql.line_type in ('labor', 'package', 'part', 'text');
  perform set_config('rts.system', '', true);

  if v_standalone then
    update public.quotes set repair_order_id = v_ro_id where id = p_quote_id;
  else
    update public.quotes set resulting_repair_order_id = v_ro_id where id = p_quote_id;
    insert into public.ro_events (repair_order_id, label, actor_id)
    select v_quote.repair_order_id,
           'Devis accepté · nouvel OR ' || r.number || ' créé', auth.uid()
    from public.repair_orders r where r.id = v_ro_id;
  end if;
  return v_ro_id;
end;
$$;

-- OR déjà créés depuis un devis et pas encore facturés : même mise en forme, seulement si le texte
-- est encore celui généré automatiquement (jamais retouché par le bureau). Simple remise en forme :
-- ni notification « OR modifié » au technicien, ni badge « Modifié » sur sa liste.
alter table public.repair_orders disable trigger repair_orders_push;
alter table public.repair_orders disable trigger repair_orders_before_update;

update public.repair_orders r
   set requested_work = s.lines
  from (
    select q.id as quote_id,
           string_agg(split_part(ql.description, E'\n', 1), ', ' order by ql.position) as comma,
           string_agg(split_part(ql.description, E'\n', 1), E'\n' order by ql.position) as lines
    from public.quotes q
    join public.quote_lines ql on ql.quote_id = q.id and ql.section = 'planned' and ql.line_type <> 'text'
    group by q.id
  ) s
 where r.origin_quote_id = s.quote_id
   and r.status <> 'invoiced'
   and r.requested_work = s.comma
   and s.comma <> s.lines;

alter table public.repair_orders enable trigger repair_orders_before_update;
alter table public.repair_orders enable trigger repair_orders_push;
