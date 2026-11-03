-- Ligne de facture : vente d'un véhicule (type à part : ni main d'œuvre ni pièce dans les statistiques)
alter type public.line_type add value if not exists 'vehicle';
