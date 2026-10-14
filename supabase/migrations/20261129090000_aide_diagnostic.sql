-- Aide au diagnostic du mécanicien (retours du client)
--   * Bouton « Aide au diagnostic » sur la fiche OR : l'assistant (fonction diagnostic) reçoit
--     l'historique du véhicule (OR passés, travaux, pièces, kilométrages, dernière fiche de contrôle)
--     et des passages de la documentation technique, puis propose des pistes en citant ses sources.
--   * Documentation technique : PDF ajoutés par la direction, découpés en passages (fonction
--     knowledge-ingest) et cherchés en plein texte français. Claude ne s'entraîne pas sur ces
--     documents : il y cherche les passages utiles à chaque question.

-- ---------------------------------------------------------------------------
-- Documentation technique
-- ---------------------------------------------------------------------------

create table public.knowledge_documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  file_id     uuid references public.files (id) on delete set null,
  status      text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  pages       integer check (pages >= 0),
  chunks      integer not null default 0 check (chunks >= 0),
  error       text,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.knowledge_documents is
  'Documentation technique (PDF) consultée par l''aide au diagnostic.';

create table public.knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.knowledge_documents (id) on delete cascade,
  page         integer not null check (page >= 1),
  position     integer not null default 0,
  content      text not null check (char_length(content) between 1 and 4000),
  tsv          tsvector generated always as (to_tsvector('french', content)) stored
);
create index knowledge_chunks_tsv_idx on public.knowledge_chunks using gin (tsv);
create index knowledge_chunks_document_idx on public.knowledge_chunks (document_id, page, position);

create trigger set_updated_at before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
create policy knowledge_documents_select on public.knowledge_documents for select to authenticated
  using (public.is_office());
create policy knowledge_documents_insert on public.knowledge_documents for insert to authenticated
  with check (public.is_direction() and status = 'pending');
create policy knowledge_documents_delete on public.knowledge_documents for delete to authenticated
  using (public.is_direction());
-- Passages : écrits par la fonction knowledge-ingest, lus par search_knowledge (et la direction)
create policy knowledge_chunks_select on public.knowledge_chunks for select to authenticated
  using (public.is_direction());
revoke all on public.knowledge_documents, public.knowledge_chunks from public, anon;
grant select, insert, delete on public.knowledge_documents to authenticated;
grant select on public.knowledge_chunks to authenticated;

-- Passages les plus proches d'une question (plein texte français, mots reliés par « ou »).
create or replace function public.search_knowledge(p_query text, p_limit integer default 6)
returns table (title text, page integer, content text, rank real)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select to_tsquery('french', string_agg(lexeme, ' | ')) as query
    from (
      select distinct unnest(tsvector_to_array(to_tsvector('french', coalesce(p_query, '')))) as lexeme
    ) words
    where length(lexeme) > 1
  )
  select d.title, c.page, c.content, ts_rank_cd(c.tsv, q.query) as rank
  from q, public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id and d.status = 'ready'
  where q.query is not null and c.tsv @@ q.query
  order by rank desc
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
$$;

-- ---------------------------------------------------------------------------
-- Historique du véhicule pour le diagnostic
-- ---------------------------------------------------------------------------

-- Véhicule de l'OR, ses 15 derniers passages (travaux, pièces, kilométrage) et la fiche de contrôle
-- de l'OR. Ouvert au bureau et au technicien de l'OR.
create or replace function public.vehicle_history_for_diagnosis(p_repair_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
begin
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;
  if not (public.is_office() or v_ro.technician_id = public.current_technician_id()) then
    raise exception 'OR d''un autre technicien' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'vehicule', (select jsonb_build_object('immatriculation', v.plate, 'type', v.vehicle_type, 'marque', v.brand,
                                          'modele', v.model, 'vin', v.vin,
                                          'premiere_immatriculation', v.first_registration_date)
                 from public.vehicles v where v.id = v_ro.vehicle_id),
    'or_en_cours', jsonb_build_object('numero', v_ro.number, 'demande', v_ro.requested_work,
                                      'kilometrage', v_ro.mileage),
    'fiche_de_controle', (select i.data from public.inspections i where i.repair_order_id = v_ro.id),
    'passages', coalesce((
      select jsonb_agg(p order by p ->> 'date' desc)
      from (
        select jsonb_build_object(
                 'numero', r.number, 'date', r.created_at::date, 'kilometrage', r.mileage,
                 'demande', r.requested_work,
                 'travaux', (select jsonb_agg(l.description order by l.position)
                             from public.ro_lines l
                             where l.repair_order_id = r.id and l.kind = 'done' and l.line_type <> 'part'
                               and btrim(l.description) <> ''),
                 'pieces', (select jsonb_agg(l.description order by l.position)
                            from public.ro_lines l
                            where l.repair_order_id = r.id and l.line_type = 'part' and btrim(l.description) <> '')
               ) as p
        from public.repair_orders r
        where r.vehicle_id = v_ro.vehicle_id and r.id <> v_ro.id
        order by r.created_at desc
        limit 15
      ) history
    ), '[]'::jsonb)
  );
end;
$$;

-- Journal des demandes (coût, suivi) : lisible par la direction, écrit par la fonction diagnostic.
create table public.diagnostic_requests (
  id                uuid primary key default gen_random_uuid(),
  repair_order_id   uuid references public.repair_orders (id) on delete set null,
  profile_id        uuid references public.profiles (id) on delete set null,
  question          text not null,
  answer            text not null,
  sources           jsonb not null default '[]'::jsonb,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  created_at        timestamptz not null default now()
);
create index diagnostic_requests_profile_idx on public.diagnostic_requests (profile_id, created_at desc);
alter table public.diagnostic_requests enable row level security;
create policy diagnostic_requests_select on public.diagnostic_requests for select to authenticated
  using (public.is_direction());
revoke all on public.diagnostic_requests from public, anon;
grant select on public.diagnostic_requests to authenticated;

revoke execute on function public.search_knowledge(text, integer),
  public.vehicle_history_for_diagnosis(uuid) from public, anon;
grant execute on function public.search_knowledge(text, integer),
  public.vehicle_history_for_diagnosis(uuid) to authenticated;
