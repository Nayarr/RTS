-- =============================================================================
-- Location — type de ligne « location » sur les factures (véhicule loué ou prêté,
-- kilomètres, carburant, retard, dommages). Ajouté seul : une nouvelle valeur d'enum
-- ne peut pas servir dans la transaction qui la crée.
-- =============================================================================
alter type public.line_type add value if not exists 'rental';
