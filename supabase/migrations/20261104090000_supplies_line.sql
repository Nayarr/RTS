-- Ligne « Fournitures et recyclage » ajoutée automatiquement à chaque nouveau devis et à chaque nouvelle
-- facture (brouillon, pro forma). Ligne ordinaire : supprimable, montant modifiable. Montant réglable
-- dans Réglages (15 € HT à la mise en place, vide = pas de ligne). Pas pour les factures de contrat
-- d'entretien ni pour les documents repris de l'ancienne appli.

alter table public.company_settings
  add column supplies_fee_ht numeric(12,2) check (supplies_fee_ht >= 0);
comment on column public.company_settings.supplies_fee_ht is
  'Montant HT de la ligne « Fournitures et recyclage » ajoutée aux nouveaux devis et factures (vide : aucune).';
update public.company_settings set supplies_fee_ht = 15;

create or replace function public.add_supplies_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vat numeric;
  v_fee numeric;
begin
  select default_vat_rate, supplies_fee_ht into v_vat, v_fee from public.company_settings;
  if coalesce(v_fee, 0) <= 0 then
    return null;
  end if;
  if tg_table_name = 'quotes' then
    if new.legacy_id is null then
      insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity, vat_rate)
      values (new.id, 'planned', 1000, 'consumable', 'Fournitures et recyclage', v_fee, 1, coalesce(v_vat, 20));
    end if;
  elsif new.maintenance_contract_id is null and not new.is_legacy_import and new.legacy_id is null then
    insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
    values (new.id, 1000, 'consumable', 'Fournitures et recyclage', v_fee, 1, coalesce(v_vat, 20));
  end if;
  return null;
end;
$$;
revoke execute on function public.add_supplies_line() from public, anon, authenticated;

create trigger quotes_add_supplies_line
  after insert on public.quotes
  for each row execute function public.add_supplies_line();
create trigger invoices_add_supplies_line
  after insert on public.invoices
  for each row execute function public.add_supplies_line();
