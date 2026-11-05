-- Mention de reprise des pneus usagés (ancienne facture de l'atelier), à la suite des mentions légales.
-- Modifiable ou retirable ensuite dans les réglages (Facturation).
update public.company_settings
   set invoice_legal_mentions = array_append(
         invoice_legal_mentions,
         'Remettez vos pneus usagés, sans obligation d''achat, à un professionnel proposant la vente ou le montage de pneus. Plus d''informations : quefairedemesdechets.fr'
       )
 where not exists (select 1 from unnest(invoice_legal_mentions) as mention where mention like 'Remettez vos pneus usagés%');
