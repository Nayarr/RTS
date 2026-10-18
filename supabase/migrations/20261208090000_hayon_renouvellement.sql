-- =============================================================================
-- RTS Atelier : contrôle hayon renouvelé par le devis
--
-- Un devis qui comprend le contrôle du hayon (forfait déclenché par la case « Étiquette contrôle
-- hayon » de la fiche, ou forfait « Contrôle hayon ») repousse l'échéance du hayon du véhicule à
-- 6 mois après son émission (premier envoi au client, ou accord saisi au bureau sans envoi) : le
-- rappel du contrôle n'est plus envoyé alors que le contrôle vient d'être refait.
-- =============================================================================

-- Ligne de devis du contrôle du hayon
create function public.is_tailgate_check_line(p_package_id uuid, p_description text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.service_packages p
    where p.id = p_package_id
      and ('controles.hayon' = any (p.trigger_fields) or p.name ~* 'contr[oô]le\s+(du\s+)?hayon')
  ) or coalesce(split_part(p_description, E'\n', 1), '') ~* '^(forfait\s+)?contr[oô]le\s+(du\s+)?hayon';
$$;
revoke execute on function public.is_tailgate_check_line(uuid, text) from public, anon;

create function public.quotes_tailgate_renewal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due date;
begin
  -- Émission : premier envoi au client, ou accord saisi au bureau sans envoi
  if new.vehicle_id is null
     or not ((old.sent_at is null and new.sent_at is not null)
             or (new.sent_at is null and new.status = 'accepted' and old.status is distinct from 'accepted')) then
    return null;
  end if;
  if not exists (select 1 from public.quote_lines l
                 where l.quote_id = new.id and l.line_type in ('package', 'labor')
                   and public.is_tailgate_check_line(l.package_id, l.description)) then
    return null;
  end if;

  -- Échéance au mois (1er du mois), 6 mois après l'émission du devis
  v_due := (date_trunc('month', coalesce(new.sent_at, now()) at time zone 'Europe/Paris') + interval '6 months')::date;
  update public.vehicles set tailgate_due_date = v_due
  where id = new.vehicle_id and tailgate_due_date is distinct from v_due;
  if found and new.repair_order_id is not null then
    insert into public.ro_events (repair_order_id, label)
    values (new.repair_order_id,
            'Contrôle hayon au devis ' || coalesce(new.number, '') || ' : prochaine échéance '
            || to_char(v_due, 'MM/YYYY'));
  end if;
  return null;
end;
$$;
revoke execute on function public.quotes_tailgate_renewal() from public, anon, authenticated;

create trigger quotes_tailgate_renewal
  after update of sent_at, status on public.quotes
  for each row execute function public.quotes_tailgate_renewal();
