-- =============================================================================
-- Pneumatiques : profil « multi-positions » pour un poids lourd
--
-- Un pneu multi-positions se monte à l'avant, à l'arrière ou sur une remorque : c'est un profil de
-- plus pour les poids lourds (avant, arrière, remorque, multi-positions ; toutes positions pour un
-- utilitaire). Au devis, il est proposé juste après les pneus du profil de la position.
-- =============================================================================

alter type public.tire_profile add value if not exists 'multi' after 'remorque';

-- Libellé de l'alerte du seuil
create or replace function public.tire_line_alert(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.tire_lines;
  v_available integer;
  v_missing integer;
  v_label text;
begin
  select * into v_line from public.tire_lines where id = p_line_id;
  if not found or v_line.min_qty = 0 then
    return;
  end if;
  -- Disponible de la seule ligne (en stock - réservé)
  select coalesce(sum(t.stock_qty), 0) - coalesce((select sum(r.reserved) from public.tire_reserved_quantities(p_line_id) r), 0)
    into v_available
  from public.tires t where t.line_id = p_line_id and t.is_active;
  if v_available >= v_line.min_qty then
    return;
  end if;
  v_missing := v_line.min_qty - v_available;
  v_label := v_line.size || case v_line.profile when 'avant' then ' avant' when 'arriere' then ' arrière'
                                                 when 'remorque' then ' remorque' when 'multi' then ' multi-positions' else '' end;
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select role, 'low_stock',
         case when v_available <= 0 then 'Rupture de pneus : ' else 'Pneus à commander : ' end || v_label,
         'Disponible ' || v_available || ' (seuil ' || v_line.min_qty || ') : il manque '
           || v_missing || ' pneu' || case when v_missing > 1 then 's' else '' end,
         '/stock/pneumatiques?filtre=seuil',
         'tire-' || p_line_id || '-' || role || '-' || public.paris_date(now())
  from unnest(array['direction', 'reception']::public.app_role[]) as role
  on conflict (dedupe_key) do nothing;
end;
$$;
