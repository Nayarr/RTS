-- =============================================================================
-- Remise à zéro de l'activité avant la reprise des données de GTA PRO
--
--   npx supabase db query --linked -f scripts/reprise/purge-activite.sql
--
-- Efface tout ce qui a été saisi dans l'appli : clients, véhicules, OR, devis, factures, avoirs,
-- paiements, relances, rendez-vous, contrats, locations, permis, messages, mails reçus, notifications,
-- historique de l'Agent, pointages, congés, stock des pneus et mouvements des consommables.
--
-- Garde les réglages : comptes et rôles, techniciens et codes de la borne, réglages de l'atelier et
-- de l'appli, tarifs, forfaits, pièces, consommables, fournisseurs, marques et dimensions de pneus,
-- flotte de location et ses documents, base de connaissances de l'Agent, abonnements aux notifications.
--
-- Les numéros repartent de 1 (OR, devis, avoirs, locations). Les factures continuent après le dernier
-- numéro de GTA PRO : vérifier DERNIERE_FACTURE_GTA ci-dessous avant de lancer le script.
-- Les fichiers des données effacées (photos, PDF, signatures) sont marqués orphelins : la tâche de
-- nuit les efface de R2.
--
-- Irréversible : faire une sauvegarde avant (npx supabase db dump --linked --data-only -f ...).
-- =============================================================================

begin;

truncate table
  public.agent_actions,
  public.agent_briefings,
  public.agent_turns,
  public.agent_conversations,
  public.auto_mail_log,
  public.booking_links,
  public.client_messages,
  public.signature_requests,
  public.warranty_claims,
  public.tire_movements,
  public.tire_quote_requests,
  public.tires,
  public.consumable_movements,
  public.payments,
  public.invoice_reminders,
  public.credit_notes,
  public.invoice_lines,
  public.invoice_repair_orders,
  public.invoices,
  public.rental_damages,
  public.rental_inspections,
  public.rental_photos,
  public.rentals,
  public.rental_sequences,
  public.driving_licenses,
  public.quote_lines,
  public.quotes,
  public.ro_consumables,
  public.ro_events,
  public.ro_lines,
  public.ro_photos,
  public.subcontracts,
  public.inspections,
  public.diagnostic_requests,
  public.time_entries,
  public.repair_order_seen,
  public.notification_reads,
  public.notifications,
  public.repair_orders,
  public.appointments,
  public.maintenance_contract_vehicles,
  public.maintenance_contracts,
  public.inbox_emails,
  public.email_deliveries,
  public.push_outbox,
  public.clock_events,
  public.leave_requests,
  public.kiosk_presence,
  public.kiosk_failed_attempts,
  public.public_link_misses,
  public.vehicles,
  public.clients;

-- Pièces des lots de pneus effacés (elles ne servent qu'au stock des pneus)
delete from public.parts where is_tire;

-- Numérotation : dernier numéro de facture émis dans GTA PRO, la suite part de ce numéro + 1
update public.document_sequences set last_value = 0 where key in ('repair_order', 'quote', 'credit_note');
update public.document_sequences set last_value = 11886 /* DERNIERE_FACTURE_GTA */ where key = 'invoice';

-- Fichiers qui ne servent plus : effacés de R2 par la tâche de nuit
select public.mark_orphan_files(interval '0') as fichiers_orphelins;

commit;
