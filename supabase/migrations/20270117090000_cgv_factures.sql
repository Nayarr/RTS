-- =============================================================================
-- Conditions générales de vente et de réparation, sur toutes les factures
--
-- Texte de l'ancienne facture de l'atelier, modifiable dans les réglages (Facturation) : imprimé en
-- dernière page du PDF (facture, pro forma, lots, pièce jointe) et affiché sur la facture en ligne.
-- =============================================================================

alter table public.company_settings
  add column invoice_terms text not null default $terms$1. OBJET ET CHAMP D'APPLICATION
Les présentes conditions s'appliquent à toutes les prestations de réparation de véhicules et à la vente de pièces réalisées par RAPID TRUCK SERVICE, 19 rue Gaston Monmousseau, 95190 Goussainville, pour les clients particuliers et professionnels. En cas de litige antérieur, le Garage se réserve le droit de refuser toute réparation. Les CGV en vigueur sont celles au jour de l'acceptation du devis ou de l'ordre de réparation.

2. ESTIMATION / DEVIS
À la demande du client, une estimation gratuite (sans démontage) ou un devis détaillé peut être établi, valable un mois. En cas de démontage nécessaire, le coût sera facturé, mais déduit si les travaux sont réalisés. Aucun travail ne sera entrepris sans accord écrit du client.

3. RÉCEPTION DU VÉHICULE
Un ordre de réparation est établi à la réception. Sa signature vaut acceptation des travaux et des présentes CGV. Le client s'engage à ne pas laisser d'objet de valeur dans le véhicule ; le Garage décline toute responsabilité en cas de vol ou dommage.

4. EXÉCUTION DES TRAVAUX
En cas de nécessité de travaux supplémentaires, un nouveau devis sera proposé. Sans réponse du client sous 5 jours, ils sont réputés refusés. Le Garage est dégagé de toute responsabilité si ces refus compromettent la réparation initiale.

5. ASSURANCES
Tout différend entre le client et son assureur ne saurait être opposé au Garage. Le paiement reste dû par le client.

6. RESTITUTION DU VÉHICULE
Le délai estimé de restitution est communiqué au client. En cas de retard, notamment lié à l'approvisionnement en pièces, le client sera informé. Il doit récupérer son véhicule dans un délai de 5 jours après notification de mise à disposition.

7. FRAIS DE PARKING
À compter du 3e jour après l'envoi de la facture, des frais de stationnement de 30 € HT par jour seront facturés. Passé ce délai, le Garage peut retenir le véhicule jusqu'au paiement intégral, selon l'article 1948 du Code civil.

8. PIÈCES REMPLACÉES
Le client peut demander l'usage de pièces issues de l'économie circulaire si disponibles. Les pièces remplacées peuvent être récupérées sur demande, sauf échange standard ou garantie.

9. PAIEMENT
Le paiement est dû au comptant lors de la restitution du véhicule. Acomptes, pièces commandées et main-d'œuvre sont facturés selon les tarifs en vigueur. En cas de non-paiement, le Garage conserve le droit de rétention du véhicule. Des pénalités s'appliquent aux professionnels en cas de retard.

10. GARANTIE COMMERCIALE
Les pièces neuves sont garanties 1 an pièces et main-d'œuvre, hors usure normale, mauvaise utilisation ou intervention extérieure. Le diagnostic est gratuit sauf en cas d'exclusion.

11. GARANTIES LÉGALES
Conformément au Code de la consommation, les pièces bénéficient de la garantie légale de conformité (2 ans) et de la garantie contre les vices cachés.$terms$;
comment on column public.company_settings.invoice_terms is
  'Conditions générales imprimées sur chaque facture (vide : pas de page de conditions).';

-- Facture en ligne : conditions générales
CREATE OR REPLACE FUNCTION public.public_find_document(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company jsonb;
  v_quote public.quotes;
  v_invoice public.invoices;
  v_client public.clients;
  v_request public.signature_requests;
  v_ro public.repair_orders;
  v_rental public.rentals;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select jsonb_build_object(
           'legal_name', legal_name, 'address_line', address_line, 'postal_code', postal_code, 'city', city,
           'email', email, 'phone', phone, 'siret', siret, 'vat_number', vat_number)
    into v_company
  from public.company_settings;

  -- Devis
  select * into v_quote from public.quotes where public_token = p_token;
  if found then
    return jsonb_build_object(
      'type', 'quote',
      'company', v_company,
      'number', v_quote.number,
      'issued_at', v_quote.issued_at,
      'valid_until', v_quote.valid_until,
      'status', v_quote.status,
      'accepted_by_name', v_quote.accepted_by_name,
      'accepted_at', v_quote.accepted_at,
      'client_name', (select name from public.clients where id = v_quote.client_id),
      'vehicle_plate', (select plate from public.vehicles where id = v_quote.vehicle_id),
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'section', section, 'line_type', line_type, 'description', description,
                 'unit_price', unit_price, 'quantity', quantity, 'discount_percent', discount_percent,
                 'vat_rate', vat_rate, 'net_ht', net_ht) order by section, position)
        from public.quote_lines
        where quote_id = v_quote.id and (line_type = 'text' or net_ht > 0)), '[]'::jsonb),
      'totals', (select jsonb_build_object('total_ht', total_ht, 'total_vat', total_vat, 'total_ttc', total_ttc)
                 from public.v_quote_totals where quote_id = v_quote.id)
    );
  end if;

  -- Facture
  select * into v_invoice from public.invoices where public_token = p_token and status = 'issued';
  if found then
    return jsonb_build_object(
      'type', 'invoice',
      'company', v_company,
      'number', v_invoice.number,
      'issued_at', v_invoice.issued_at,
      'service_date', v_invoice.service_date,
      'due_date', v_invoice.due_date,
      'client_name', v_invoice.client_name,
      'client_address', v_invoice.client_address,
      'client_vat_number', v_invoice.client_vat_number,
      'vat_exempt_mention', v_invoice.vat_exempt_mention,
      'vehicle_label', v_invoice.vehicle_label,
      'mileage', v_invoice.mileage,
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'line_type', line_type, 'description', description, 'unit_price', unit_price,
                 'quantity', quantity, 'discount_percent', discount_percent, 'vat_rate', vat_rate,
                 'net_ht', net_ht) order by position)
        from public.invoice_lines where invoice_id = v_invoice.id), '[]'::jsonb),
      'totals', jsonb_build_object('total_ht', v_invoice.total_ht, 'total_vat', v_invoice.total_vat, 'total_ttc', v_invoice.total_ttc),
      'balance_due', (select balance_due from public.v_invoice_balances where invoice_id = v_invoice.id),
      'legal_mentions', (select to_jsonb(invoice_legal_mentions) from public.company_settings),
      'terms', (select invoice_terms from public.company_settings),
      -- RIB de l'atelier : règlement par virement
      'iban', (select iban from public.company_settings),
      'bic', (select bic from public.company_settings)
    );
  end if;

  -- Espace client (données calculées en direct)
  select * into v_client from public.clients where portal_token = p_token;
  if found then
    -- Chaque facture affichée dans l'espace client reçoit son lien de consultation.
    update public.invoices
       set public_token = public.generate_public_token()
     where client_id = v_client.id and status = 'issued' and public_token is null;

    return jsonb_build_object(
      'type', 'portal',
      'company', v_company,
      'client_name', v_client.name,
      'generated_at', now(),
      'vehicles', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'plate', v.plate,
                 'in_workshop', cur.status is not null,
                 'status_label', coalesce(public.repair_order_status_label(cur.status), 'Pas à l''atelier'),
                 'since', cur.created_at,
                 'ct_due_date', v.ct_due_date,
                 'tailgate_due_date', v.tailgate_due_date) order by v.plate)
        from public.vehicles v
        left join lateral (
          select r.status, r.created_at from public.repair_orders r
          where r.vehicle_id = v.id and r.client_id = v_client.id and r.status not in ('invoiced')
          order by r.created_at desc limit 1) cur on true
        where v.client_id = v_client.id
           or exists (select 1 from public.repair_orders r where r.vehicle_id = v.id and r.client_id = v_client.id
                        and r.status not in ('invoiced'))), '[]'::jsonb),
      'quotes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'number', q.number, 'vehicle_plate', v.plate, 'token', q.public_token) order by q.sent_at desc)
        from public.quotes q left join public.vehicles v on v.id = q.vehicle_id
        where q.client_id = v_client.id and q.status = 'sent' and q.public_token is not null), '[]'::jsonb),
      'invoices', coalesce((
        select jsonb_agg(x.doc order by x.issued_at desc)
        from (
          select i.issued_at,
                 jsonb_build_object(
                   'number', i.number, 'issued_at', i.issued_at, 'vehicle_label', i.vehicle_label,
                   'total_ttc', i.total_ttc, 'balance_due', b.balance_due, 'payment_status', b.payment_status,
                   'token', i.public_token) as doc
          from public.invoices i
          join public.v_invoice_balances b on b.invoice_id = i.id
          where i.client_id = v_client.id and i.status = 'issued'
          order by i.issued_at desc
          limit 40) x), '[]'::jsonb)
    );
  end if;

  -- Demande de signature d'un OR (lien envoyé au client absent)
  select * into v_request from public.signature_requests where public_token = p_token and channel = 'email';
  if found and v_request.rental_id is not null then
    select * into v_rental from public.rentals where id = v_request.rental_id;
    return jsonb_build_object(
      'type', 'rental_signature',
      'company', v_company,
      'status', case when v_request.status = 'pending' and v_request.expires_at <= now() then 'expired'
                     else v_request.status::text end,
      'expires_at', v_request.expires_at
    ) || public.rental_public_json(v_rental);
  end if;
  if found then
    select * into v_ro from public.repair_orders where id = v_request.repair_order_id;
    return jsonb_build_object(
      'type', 'signature',
      'company', v_company,
      'number', v_ro.number,
      'status', case when v_request.status = 'pending' and v_request.expires_at <= now() then 'expired'
                     else v_request.status::text end,
      'expires_at', v_request.expires_at,
      'signed_at', v_request.signed_at,
      'signer_name', v_request.signer_name,
      'client_name', (select name from public.clients where id = v_ro.client_id),
      'vehicle_plate', (select plate from public.vehicles where id = v_ro.vehicle_id),
      'requested_work', v_ro.requested_work,
      'planned_date', v_ro.planned_date,
      'mileage', v_ro.mileage
    );
  end if;

  -- Contrat de location envoyé au client (consultation, impression)
  select * into v_rental from public.rentals where public_token = p_token and status <> 'cancelled';
  if found then
    return jsonb_build_object('type', 'rental', 'company', v_company) || public.rental_public_json(v_rental);
  end if;

  return null;
end;
$function$;
