-- =============================================================================
-- Voix de l'Agent Direction : Ximena (voix multilingue d'Azure, lue en français) par défaut
--
-- Choix du client : Ximena (es-ES-XimenaMultilingualNeural), voix neuronale multilingue lue en
-- français de France (balise de langue dans le SSML de la fonction « tts »), dans le niveau gratuit.
-- Les voix multilingues d'une autre langue sont acceptées en plus des voix françaises. L'atelier
-- encore sur la voix par défaut (Denise) passe sur Ximena ; une autre voix choisie est gardée.
-- =============================================================================

alter table public.app_settings drop constraint app_settings_tts_voice_check;
alter table public.app_settings
  add constraint app_settings_tts_voice_check
    check (tts_voice ~ '^fr-(FR|BE|CH|CA)-[A-Za-z]+(Multilingual)?Neural$'
           or tts_voice ~ '^[a-z]{2}-[A-Z]{2}-[A-Za-z]+MultilingualNeural$'),
  alter column tts_voice set default 'es-ES-XimenaMultilingualNeural';
comment on column public.app_settings.tts_voice is
  'Voix Azure lue en français (ex. es-ES-XimenaMultilingualNeural, fr-FR-DeniseNeural).';

update public.app_settings set tts_voice = 'es-ES-XimenaMultilingualNeural'
 where tts_voice = 'fr-FR-DeniseNeural';
