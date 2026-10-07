-- =============================================================================
-- RTS Atelier : mémo de la direction pour l'Agent Direction
--
-- Texte libre écrit par la direction dans Réglages › Atelier (« Karim est chef d'atelier »,
-- « Martin, c'est BTP Martin Location »…) : ajouté aux consignes de l'agent à chaque question.
-- Lu et modifié avec les droits habituels des réglages (lecture : comptes de l'appli,
-- modification : direction).
-- =============================================================================

alter table public.app_settings
  add column agent_memo text not null default '' check (char_length(agent_memo) <= 4000);
comment on column public.app_settings.agent_memo is
  'Mémo de la direction ajouté aux consignes de l''Agent Direction (4 000 caractères au plus).';
