-- =============================================================================
-- RTS Atelier : demande de chiffrage des pneus aux fournisseurs
--
-- Les tailles sous le seuil mini sont reprises avec la quantité qui manque ; le mail ne donne
-- aucune marque : il part à un ou plusieurs fournisseurs (un envoi par fournisseur) pour comparer.
-- Chaque demande est gardée dans l'historique du stock (tailles, quantités, destinataires).
-- =============================================================================

create table public.tire_quote_requests (
  id          uuid primary key default gen_random_uuid(),
  -- [{ "size": "315/80 R22.5", "profile": "arriere", "quantity": 4 }]
  lines       jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  -- Adresses des fournisseurs (une par envoi)
  recipients  text[] not null default '{}',
  -- Envoyée par l'appli, ou texte copié / messagerie de l'ordinateur
  channel     text not null default 'email' check (channel in ('email', 'copy')),
  subject     text not null,
  body        text not null,
  sent_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  sent_at     timestamptz not null default now()
);
create index tire_quote_requests_sent_idx on public.tire_quote_requests (sent_at desc);
comment on table public.tire_quote_requests is 'Demandes de chiffrage des pneus envoyées aux fournisseurs (sans marque).';

alter table public.tire_quote_requests enable row level security;
revoke all on public.tire_quote_requests from anon;
revoke update, delete on public.tire_quote_requests from authenticated;

create policy tire_quote_requests_select on public.tire_quote_requests for select to authenticated
  using (public.is_office());
create policy tire_quote_requests_insert on public.tire_quote_requests for insert to authenticated
  with check (public.is_office() and sent_by = auth.uid());
