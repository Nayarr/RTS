-- =============================================================================
-- RTS Atelier : Messages au client depuis l'OR
--   « Véhicule pris en charge », « Devis disponible », « Véhicule prêt » : le
--   message est pré-rédigé par l'appli et envoyé par la messagerie de l'atelier
--   (e-mail ou SMS). Chaque envoi est tracé (client_messages) et apparaît dans
--   l'historique de l'OR.
-- =============================================================================

create or replace function public.client_message_label(p_type public.client_message_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'vehicle_received' then 'Véhicule pris en charge'
    when 'quote_available' then 'Devis disponible'
    when 'vehicle_ready' then 'Véhicule prêt'
    when 'appointment_reminder' then 'Rappel de rendez-vous'
    when 'quote_link' then 'Lien du devis'
    when 'invoice_link' then 'Lien de la facture'
    when 'invoice_reminder' then 'Relance de facture'
    when 'portal_link' then 'Espace client'
  end;
$$;

revoke execute on function public.client_message_label(public.client_message_type) from public, anon;
grant execute on function public.client_message_label(public.client_message_type) to authenticated;

-- Client repris de l'OR ; ligne « Message au client … » dans l'historique de l'OR.
create or replace function public.client_messages_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.repair_order_id is not null and new.client_id is null then
    select ro.client_id into new.client_id from public.repair_orders ro where ro.id = new.repair_order_id;
  end if;
  return new;
end;
$$;
revoke all on function public.client_messages_link() from public, anon, authenticated;

create trigger client_messages_link
  before insert on public.client_messages
  for each row execute function public.client_messages_link();

create or replace function public.client_messages_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.repair_order_id is not null then
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (
      new.repair_order_id,
      'Message au client'
        || case new.channel when 'email' then ' (e-mail)' when 'sms' then ' (SMS)' else '' end
        || ' : ' || public.client_message_label(new.message_type),
      auth.uid()
    );
  end if;
  return new;
end;
$$;
revoke all on function public.client_messages_log() from public, anon, authenticated;

create trigger client_messages_log
  after insert on public.client_messages
  for each row execute function public.client_messages_log();
