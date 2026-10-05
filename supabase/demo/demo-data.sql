-- =============================================================================
-- RTS Atelier : Données fictives de démonstration (base LOCALE uniquement)
--
--   npx supabase db reset && npm run db:demo
--
-- Tout passe par les fonctions métier de l'appli (numéros, totaux, statuts, historique),
-- en tant que compte réception / direction, puis les dates sont réparties sur les 12
-- derniers mois (statistiques, trésorerie, rentabilité, performance, relances).
-- Noms, SIREN, adresses et plaques sont inventés.
-- =============================================================================

\set QUIET on
set client_min_messages = warning;

-- Agir comme un compte de l'appli (même principe que les tests de la base).
create or replace function pg_temp.demo_as(p_profile uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_profile, 'role', 'authenticated')::text, false);
$$;

-- Premier jour ouvré (lundi à vendredi) à partir d'une date.
create or replace function pg_temp.demo_workday(p_day date)
returns date
language sql
as $$
  select p_day + case extract(isodow from p_day)::integer when 6 then 2 when 7 then 1 else 0 end;
$$;

do $demo$
declare
  c_direction constant uuid := '5eed0000-0000-0000-0000-000000000001';
  c_reception constant uuid := '5eed0000-0000-0000-0000-000000000002';
  c_supplier  constant uuid := '41000000-0000-0000-0000-000000000001';
  c_rectif    constant uuid := '41000000-0000-0000-0000-000000000002';
  v_today date := public.paris_date(now());
  v_techs uuid[];
  v_tech uuid;
  v_day date;
  v_ro public.repair_orders;
  v_plan record;
  v_job record;
  v_invoice_id uuid;
  v_quote uuid;
  v_n integer := 0;
  v_status public.repair_order_status;
  v_hours numeric;
  v_start timestamptz;
  v_issued date;
  v_roll double precision;
  v_pos integer;
  v_shift interval;
  v_invoice public.invoices;
  v_late boolean;
  v_paid date;
begin
  if exists (select 1 from public.clients where name = 'Transports Moreau & Fils') then
    raise exception 'Données de démonstration déjà présentes : lance « npx supabase db reset » puis « npm run db:demo »';
  end if;
  perform setseed(0.2026);

  -- ------------------------------------------------------------------ Équipe
  insert into public.technicians (display_name, color, sort_order, rest_group) values
    ('Karim', '#B5453A', 3, 'A'),
    ('Julien', '#C98A00', 4, 'B');
  update public.technicians set sort_order = 1, rest_group = 'A' where display_name = 'Alice';
  update public.technicians set sort_order = 2, rest_group = 'B' where display_name = 'Bruno';
  select array_agg(id order by sort_order) into v_techs from public.technicians where is_active;

  -- ------------------------------------------------------------------ Clients
  insert into public.clients (name, billing_address, siren, email, phone, discount_percent, hourly_rate, notes) values
    ('Transports Moreau & Fils', '12 rue des Entrepreneurs, 95190 Goussainville', '412 356 789', 'compta@moreau-transports.fr', '01 39 88 12 40', 5, null, 'Client historique, flotte de 6 tracteurs'),
    ('Logistique Bernard', 'ZA du Moulin, 4 allée des Frênes, 95500 Gonesse', '523 874 110', 'factures@logistique-bernard.fr', '01 34 45 20 11', 0, null, null),
    ('TLM Express', '87 avenue du Général de Gaulle, 93290 Tremblay-en-France', '801 223 564', 'atelier@tlm-express.fr', '06 12 45 78 90', 0, null, 'Messagerie express, VUL'),
    ('Frigo Transports Leroy', '3 rue de la Logistique, 77290 Mitry-Mory', '432 998 071', 'contact@frigo-leroy.fr', '01 60 21 33 48', 3, null, 'Groupes froids : prévenir avant toute intervention'),
    ('Messagerie du Val-d''Oise', '15 chemin des Postes, 95400 Villiers-le-Bel', '389 551 204', 'gestion@mvo95.fr', '01 39 94 60 02', 0, null, null),
    ('Déménagements Petit', '22 rue Jean Jaurès, 95200 Sarcelles', '479 012 336', 'petit.demenagements@orange.fr', '06 71 23 45 67', 0, 85, 'Tarif horaire négocié'),
    ('BTP Martin Location', 'Parc d''activités des Cerisiers, 60270 Gouvieux', '350 128 947', 'parc@btp-martin.fr', '03 44 57 80 10', 8, null, 'Bennes et porte-engins'),
    ('Transports Girard', '5 impasse des Routiers, 95470 Fosses', '511 667 382', 'girard.transports@wanadoo.fr', '06 80 11 22 33', 0, null, null),
    ('Citernes Roussel', '41 route de Senlis, 95380 Louvres', '397 404 158', 'maintenance@citernes-roussel.fr', '01 34 72 90 55', 5, null, 'Contrat d''entretien citernes'),
    ('Autocars Lambert', '9 rue de la Gare, 95270 Luzarches', '402 815 667', 'exploitation@autocars-lambert.fr', '01 34 68 01 77', 0, null, null),
    ('Fontaine Livraisons', '118 boulevard Salvador Allende, 93000 Bobigny', '844 390 125', 'fontaine.livraisons@gmail.com', '07 68 90 12 34', 0, null, 'Paiement souvent en retard'),
    ('Transports Mercier Frères', '2 rue du Stade, 77230 Dammartin-en-Goële', '308 771 459', 'mercier.freres@transports-mercier.fr', '01 60 03 44 21', 0, null, null),
    ('Nordis Fret', 'Zone Paris Nord 2, 13 rue de la Perdrix, 95950 Roissy-en-France', '752 106 833', 'fleet@nordis-fret.fr', '01 48 62 31 00', 10, null, 'Grand compte, remise 10 %'),
    ('Garnier Bennes', '6 chemin de la Carrière, 95560 Montsoult', '490 663 018', 'garnier.bennes@free.fr', '06 33 44 55 66', 0, null, null);

  -- ------------------------------------------------------------------ Véhicules (échéances réparties)
  insert into public.vehicles (plate, client_id, vehicle_type, brand, model, first_registration_date, ct_due_date, tailgate_due_date)
  select v.plate, c.id, v.vtype::public.vehicle_type, v.brand, v.model, v.reg::date,
         v_today + v.ct_offset, case when v.tail_offset is null then null else v_today + v.tail_offset end
  from (values
    ('Transports Moreau & Fils', 'FG-218-KL', 'pl', 'Renault Trucks', 'T 480', '2019-03-14', 45, null),
    ('Transports Moreau & Fils', 'GH-512-RT', 'pl', 'Volvo', 'FH 500', '2020-06-02', -12, null),
    ('Transports Moreau & Fils', 'EK-771-PA', 'remorque', 'Schmitz Cargobull', 'S.KO Cool', '2018-09-21', 120, 60),
    ('Logistique Bernard', 'GL-304-ZD', 'pl', 'Mercedes-Benz', 'Actros 1845', '2021-01-11', 200, null),
    ('Logistique Bernard', 'FN-889-QS', 'remorque', 'Krone', 'Profi Liner', '2019-11-05', 25, null),
    ('TLM Express', 'GY-145-MB', 'vul', 'Renault', 'Master', '2022-04-19', 300, 15),
    ('TLM Express', 'GZ-622-HC', 'vul', 'Iveco', 'Daily 35S16', '2022-09-30', 8, null),
    ('TLM Express', 'HA-017-TR', 'vul', 'Ford', 'Transit', '2023-02-07', 180, null),
    ('Frigo Transports Leroy', 'FT-440-JM', 'pl', 'DAF', 'XF 480', '2019-05-28', 70, null),
    ('Frigo Transports Leroy', 'EZ-093-WV', 'remorque', 'Chereau', 'Inogam', '2018-07-16', -5, 30),
    ('Messagerie du Val-d''Oise', 'GP-736-NE', 'vul', 'Mercedes-Benz', 'Sprinter', '2021-10-01', 150, 90),
    ('Messagerie du Val-d''Oise', 'GR-258-LD', 'pl', 'Renault Trucks', 'D Wide', '2021-12-13', 35, 20),
    ('Déménagements Petit', 'FK-661-BA', 'pl', 'MAN', 'TGL 12.250', '2018-04-03', 95, null),
    ('BTP Martin Location', 'FD-907-XC', 'pl', 'Scania', 'R 450', '2018-02-22', 18, null),
    ('BTP Martin Location', 'GC-385-PF', 'pl', 'Volvo', 'FMX 460', '2020-08-17', 240, null),
    ('Transports Girard', 'GE-129-SK', 'pl', 'Iveco', 'S-Way', '2020-12-04', 160, null),
    ('Citernes Roussel', 'FR-552-YH', 'pl', 'Renault Trucks', 'C 430', '2019-06-25', 55, null),
    ('Citernes Roussel', 'FS-018-GN', 'remorque', 'Magyar', 'Citerne 30 m3', '2019-06-25', 55, null),
    ('Autocars Lambert', 'GF-844-UA', 'pl', 'Iveco', 'Crossway', '2020-09-09', 75, null),
    ('Fontaine Livraisons', 'HB-376-CP', 'vul', 'Renault', 'Master', '2023-05-22', 260, 110),
    ('Transports Mercier Frères', 'FV-213-DE', 'pl', 'DAF', 'CF 450', '2019-08-30', -30, null),
    ('Nordis Fret', 'GM-481-VW', 'pl', 'Scania', 'S 500', '2021-03-15', 130, null),
    ('Nordis Fret', 'GN-990-KB', 'pl', 'Mercedes-Benz', 'Actros 1851', '2021-04-02', 10, null),
    ('Nordis Fret', 'GP-105-AZ', 'remorque', 'Schmitz Cargobull', 'S.CS Universal', '2021-04-02', 190, null),
    ('Garnier Bennes', 'FL-747-RN', 'pl', 'Renault Trucks', 'K 440', '2018-10-10', 22, null)
  ) as v(client, plate, vtype, brand, model, reg, ct_offset, tail_offset)
  join public.clients c on c.name = v.client;

  -- ------------------------------------------------------------------ Travaux types
  create temporary table demo_jobs (id integer primary key, label text, hours numeric, part text, part_price numeric,
                                    part_qty numeric, part_purchase numeric, brand text, ref text) on commit drop;
  insert into demo_jobs values
    (1, 'Remplacement plaquettes de frein avant', 1.5, 'Plaquettes de frein avant (jeu)', 138, 1, 92, 'Knorr-Bremse', 'K-II37'),
    (2, 'Vidange moteur et remplacement des filtres', 2, 'Filtre à huile', 32, 2, 21.5, 'Mann-Filter', 'HU 12 140 x'),
    (3, 'Remplacement disques de frein arrière', 3, 'Disque de frein arrière', 165, 2, 118, 'SBP', '02-MA010'),
    (4, 'Diagnostic électrique (voyant ABS)', 1, null, null, null, null, null, null),
    (5, 'Recherche et réparation fuite circuit d''air', 2.5, 'Raccord pneumatique', 24, 3, 11, 'Wabco', '893 000 610 2'),
    (6, 'Remplacement feux arrière et ampoules', 0.5, 'Feu arrière LED', 96, 1, 58, 'Aspöck', '25-7100-507'),
    (7, 'Contrôle et réglage hayon élévateur', 1, null, null, null, null, null, null),
    (8, 'Remplacement batteries', 0.5, 'Batterie 12V 225Ah', 245, 2, 168, 'Varta', '725 012 115'),
    (9, 'Géométrie train avant', 1.5, null, null, null, null, null, null),
    (10, 'Remplacement kit embrayage', 6, 'Kit embrayage', 890, 1, 612, 'Sachs', '3400 700 459'),
    (11, 'Recharge climatisation et contrôle étanchéité', 1.5, null, null, null, null, null, null),
    (12, 'Remplacement pneus avant', 1, 'Pneu 385/65 R22.5', 420, 2, 310, 'Michelin', 'X Multi T'),
    (13, 'Remplacement courroie d''accessoires et galets', 2, 'Kit courroie + galets', 185, 1, 121, 'Gates', 'K016PK2040'),
    (14, 'Réparation suspension pneumatique (coussin arrière)', 2.5, 'Coussin de suspension', 210, 1, 142, 'Firestone', 'W01-M58-8764');

  -- ------------------------------------------------------------------ Plan des OR (12 mois + semaine à venir)
  create temporary table demo_plan on commit drop as
  with days as (
    select d::date as day, s.n
    from generate_series(v_today - 360, v_today + 6, interval '1 day') d
    cross join generate_series(1, 3) s(n)
    where extract(isodow from d) < 6
      and random() < case when d::date >= v_today - 3 then 0.95
                          else case s.n when 1 then 0.9 when 2 then 0.7 else 0.35 end end
  ),
  drawn as (
    select day, n, (select v.id from public.vehicles v where day is not null order by random() limit 1) as vehicle_id
    from days
  ),
  -- Un seul OR par véhicule et par jour
  picked as (
    select * from (select d.*, row_number() over (partition by day, vehicle_id order by n) as k from drawn d) x
    where k = 1
  )
  select row_number() over (order by p.day, p.n) as seq, p.day, v.id as vehicle_id, v.plate, v.vehicle_type,
         c.name as client_name, (1 + floor(random() * 14))::integer as job1,
         case when random() < 0.45 then (1 + floor(random() * 14))::integer end as job2,
         null::uuid as ro_id
  from picked p
  join public.vehicles v on v.id = p.vehicle_id
  join public.clients c on c.id = v.client_id;

  perform pg_temp.demo_as(c_reception);

  for v_plan in select * from demo_plan order by seq loop
    v_n := v_n + 1;
    v_tech := v_techs[1 + (v_n % array_length(v_techs, 1))];
    select * into v_job from demo_jobs where id = v_plan.job1;

    v_ro := public.create_repair_order(
      p_client_name => v_plan.client_name,
      p_plate => v_plan.plate,
      p_vehicle_type => v_plan.vehicle_type,
      p_requested_work => v_job.label || coalesce(' + ' || (select lower(label) from demo_jobs where id = v_plan.job2), ''),
      p_technician_id => v_tech,
      p_mileage => (80000 + floor(random() * 520000))::integer,
      p_planned_date => case when v_plan.day >= v_today then v_plan.day end,
      p_planned_start => case when v_plan.day >= v_today then (time '08:00' + (floor(random() * 8) || ' hours')::interval) end);
    update pg_temp.demo_plan set ro_id = v_ro.id where seq = v_plan.seq;

    -- Statut visé selon l'ancienneté
    v_roll := random();
    v_status := case
      when v_plan.day > v_today then 'assigned'
      when v_plan.day = v_today then case when v_roll < 0.75 then 'in_progress' else 'assigned' end
      when v_plan.day >= v_today - 3 then case when v_roll < 0.35 then 'in_progress' when v_roll < 0.7 then 'work_done' else 'quote_pending' end
      when v_plan.day >= v_today - 12 then case when v_roll < 0.45 then 'invoiced' when v_roll < 0.8 then 'work_done' else 'quote_pending' end
      else 'invoiced' end;

    -- Travaux réalisés (lignes « effectuées ») et pièces
    if v_status <> 'assigned' then
      v_pos := 0;
      for v_job in select * from demo_jobs where id in (v_plan.job1, v_plan.job2) loop
        v_pos := v_pos + 1;
        insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, billed_hours)
        values (v_ro.id, 'done', v_pos, 'labor', v_job.label, v_job.hours,
                case when v_status = 'invoiced' then v_job.hours end);
        if v_job.part is not null then
          insert into public.ro_lines (repair_order_id, kind, position, line_type, description, quantity, unit_price,
                                       purchase_price, supplier_id, brand, manufacturer_ref, order_status)
          values (v_ro.id, 'done', 100 + v_pos, 'part', v_job.part, v_job.part_qty, v_job.part_price, v_job.part_purchase,
                  c_supplier, v_job.brand, v_job.ref,
                  case when v_status = 'in_progress' and v_pos = 1 and random() < 0.6 then 'ordered'::public.part_order_status else 'received'::public.part_order_status end);
        end if;
        -- Temps badgé : estimation ± 30 %
        if v_status <> 'in_progress' then
          v_hours := v_job.hours * (0.75 + random() * 0.55);
          v_start := (v_plan.day + time '08:30' + ((v_pos - 1) * 3 || ' hours')::interval) at time zone 'Europe/Paris';
          insert into public.time_entries (repair_order_id, technician_id, started_at, ended_at)
          values (v_ro.id, v_tech, v_start, v_start + (v_hours || ' hours')::interval);
        end if;
      end loop;
    end if;

    if v_status = 'in_progress' then
      insert into public.time_entries (repair_order_id, technician_id, started_at)
      values (v_ro.id, v_tech, now() - ((20 + floor(random() * 100)) || ' minutes')::interval);
    end if;
    if v_status = 'quote_pending' then
      insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours)
      values (v_ro.id, 'planned', 50, 'labor', (select label from demo_jobs where id = 1 + (v_plan.job1 + 4) % 14), 2);
    end if;

    if v_status <> 'assigned' then
      update public.repair_orders set status = case when v_status = 'invoiced' then 'work_done' else v_status end
      where id = v_ro.id;
    end if;
    if v_status = 'invoiced' then
      v_invoice_id := public.build_invoice_draft(array[v_ro.id]);
      perform public.issue_invoice(v_invoice_id);
    end if;
  end loop;

  -- ------------------------------------------------------------------ Devis
  -- Devis préparés depuis les OR « devis à faire » : brouillon, envoyés, un refusé, un accepté
  -- (travaux avant devis encore à facturer / offrir).
  v_n := 0;
  for v_ro in select r.* from public.repair_orders r where r.status = 'quote_pending' order by r.number loop
    v_n := v_n + 1;
    v_quote := public.build_quote_from_repair_order(v_ro.id);
    if v_n % 4 = 1 then
      perform public.assign_quote_number(v_quote, true);
      perform public.share_quote(v_quote);
    elsif v_n % 4 = 2 then
      perform public.set_quote_response(v_quote, 'accepted');
    elsif v_n % 4 = 3 then
      perform public.set_quote_response(v_quote, 'refused');
    end if;
  end loop;
  -- Deux devis sans OR (demande directe d'un client)
  select (public.create_quote('Autocars Lambert', 'GF-844-UA', 'pl')).id into v_quote;
  insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity, estimated_hours) values
    (v_quote, 'planned', 1, 'labor', 'Remplacement compresseur de climatisation', 90, 4, 4),
    (v_quote, 'planned', 2, 'part', 'Compresseur de climatisation', 1180, 1, null);
  perform public.assign_quote_number(v_quote, true);
  select (public.create_quote('Garnier Bennes', 'FL-747-RN', 'pl')).id into v_quote;
  insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity, estimated_hours) values
    (v_quote, 'planned', 1, 'labor', 'Réfection vérin de benne', 90, 5, 5);

  -- ------------------------------------------------------------------ Sous-traitance en retard, garanties
  select * into v_ro from public.repair_orders where status = 'in_progress' order by number limit 1;
  if found then
    insert into public.subcontracts (repair_order_id, supplier_id, service, cost_ht, margin_percent, sent_on, expected_return_on)
    values (v_ro.id, c_rectif, 'Rectification culasse', 450, 20, v_today - 12, v_today - 2);
  end if;
  insert into public.warranty_claims (repair_order_id, ro_line_id, part_name, brand, reference, supplier_id, reason, status, amount_ht)
  select l.repair_order_id, l.id, l.description, l.brand, l.manufacturer_ref, c_supplier, w.reason,
         w.status::public.warranty_status, l.purchase_price
  from (values (1, 'Bruit anormal après 2 semaines', 'to_return'),
               (2, 'Pièce défectueuse à la livraison', 'sent'),
               (3, 'Usure prématurée', 'refunded')) as w(n, reason, status)
  join lateral (select l.* from public.ro_lines l join public.repair_orders r on r.id = l.repair_order_id
                where l.line_type = 'part' and r.status = 'invoiced'
                order by r.number desc offset w.n * 3 limit 1) l on true;

  -- ------------------------------------------------------------------ Rendez-vous
  perform public.save_appointment(p_client_name => 'Logistique Bernard', p_plate => 'GL-304-ZD', p_vehicle_type => 'pl',
    p_scheduled_date => pg_temp.demo_workday(v_today + 1), p_start_time => '09:00', p_end_time => '11:00',
    p_reason => 'Entretien 120 000 km', p_technician_id => v_techs[1]);
  perform public.save_appointment(p_client_name => 'Frigo Transports Leroy', p_plate => 'EZ-093-WV', p_vehicle_type => 'remorque',
    p_scheduled_date => pg_temp.demo_workday(v_today + 1), p_start_time => '14:00', p_reason => 'Contrôle hayon avant visite');
  perform public.save_appointment(p_client_name => 'Transports Girard', p_plate => 'GE-129-SK', p_vehicle_type => 'pl',
    p_scheduled_date => pg_temp.demo_workday(v_today + 3), p_start_time => '08:30', p_reason => 'Bruit boîte de vitesses');
  perform public.save_appointment(p_client_name => 'Nordis Fret', p_plate => 'GN-990-KB', p_vehicle_type => 'pl',
    p_scheduled_date => pg_temp.demo_workday(v_today + 6), p_start_time => '10:00', p_reason => 'Préparation contrôle technique');
  perform public.save_appointment(p_client_name => 'Déménagements Petit', p_plate => 'FK-661-BA', p_vehicle_type => 'pl',
    p_scheduled_date => pg_temp.demo_workday(v_today + 8), p_start_time => '09:30', p_reason => 'Pneus arrière');

  -- ------------------------------------------------------------------ Contrats d'entretien
  perform public.save_maintenance_contract(p_client_name => 'Transports Moreau & Fils',
    p_plates => array['FG-218-KL', 'GH-512-RT'], p_service_description => 'Entretien préventif complet',
    p_frequency_months => 3, p_monthly_price_ht => 180, p_starts_on => (v_today - 240));
  perform public.save_maintenance_contract(p_client_name => 'Citernes Roussel',
    p_plates => array['FR-552-YH', 'FS-018-GN'], p_service_description => 'Vidange, graissage et contrôle freinage',
    p_frequency_km => 30000, p_frequency_months => 6, p_monthly_price_ht => 120, p_starts_on => (v_today - 400));

  -- ------------------------------------------------------------------ Congés
  -- Saisis par la direction : validés d'office. Une demande d'un technicien reste à traiter.
  perform pg_temp.demo_as(c_direction);
  perform public.save_leave_request(p_technician_id => v_techs[2], p_leave_type => 'paid_leave',
    p_starts_on => v_today + 21, p_ends_on => v_today + 25, p_comment => 'Vacances');
  perform public.save_leave_request(p_technician_id => v_techs[1], p_leave_type => 'sick',
    p_starts_on => v_today - 16, p_ends_on => v_today - 15);
  perform public.save_leave_request(p_technician_id => v_techs[4], p_leave_type => 'training',
    p_starts_on => v_today + 10, p_ends_on => v_today + 10, p_comment => 'Formation climatisation');
  insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, status, comment)
  values (v_techs[3], 'paid_leave', v_today + 35, v_today + 39, 'requested', 'Mariage de mon frère');

  -- ==================================================================
  -- Dates réparties dans le passé. Les règles métier (facture émise figée,
  -- OR facturé verrouillé…) sont suspendues le temps de ce recalage.
  -- ==================================================================
  perform set_config('session_replication_role', 'replica', true);

  for v_plan in select * from pg_temp.demo_plan where day < v_today and ro_id is not null order by seq loop
    v_shift := now() - ((v_plan.day + time '08:15') at time zone 'Europe/Paris');
    update public.repair_orders
       set created_at = created_at - v_shift, updated_at = updated_at - v_shift,
           assignment_changed_at = assignment_changed_at - v_shift,
           completed_at = completed_at - v_shift + interval '6 hours',
           planned_date = v_plan.day, planned_start = '08:30', planned_end = '12:00'
     where id = v_plan.ro_id;
    update public.ro_lines set created_at = created_at - v_shift, updated_at = updated_at - v_shift
     where repair_order_id = v_plan.ro_id;
    update public.ro_events set created_at = created_at - v_shift + interval '1 hour'
     where repair_order_id = v_plan.ro_id;
    update public.quotes
       set created_at = created_at - v_shift + interval '1 day', updated_at = updated_at - v_shift + interval '1 day',
           sent_at = sent_at - v_shift + interval '1 day', accepted_at = accepted_at - v_shift + interval '2 days',
           refused_at = refused_at - v_shift + interval '2 days',
           valid_until = (v_plan.day + 31)
     where repair_order_id = v_plan.ro_id;

    -- Facture émise 1 à 3 jours ouvrés après l'intervention (jamais dans le futur)
    v_issued := least(v_plan.day + (1 + floor(random() * 3))::integer, v_today);
    update public.invoices i
       set issued_at = (v_issued + time '17:30') at time zone 'Europe/Paris',
           created_at = (v_issued + time '17:00') at time zone 'Europe/Paris',
           updated_at = (v_issued + time '17:30') at time zone 'Europe/Paris',
           service_date = v_plan.day,
           due_date = v_issued + 30
      from public.invoice_repair_orders iro
     where iro.invoice_id = i.id and iro.repair_order_id = v_plan.ro_id and i.status = 'issued';
  end loop;

  -- Paiements : la plupart payées (virement surtout), quelques retards, un mauvais payeur.
  perform pg_temp.demo_as(c_reception);
  for v_invoice in select i.* from public.invoices i where i.status = 'issued' order by i.issued_at loop
    v_roll := random();
    select name = 'Fontaine Livraisons' into v_late from public.clients where id = v_invoice.client_id;
    continue when v_late and v_invoice.due_date < v_today
                  and v_invoice.issued_at > now() - interval '120 days';  -- mauvais payeur récent (relances)
    continue when v_invoice.due_date >= v_today and v_roll < 0.6;    -- pas encore échues, pas encore payées
    continue when v_invoice.due_date < v_today and v_roll < 0.025;   -- quelques impayés
    v_paid := least(v_invoice.issued_at::date + (8 + floor(random() * 40))::integer, v_today);
    insert into public.payments (invoice_id, amount_ttc, method, paid_on, recorded_by)
    values (v_invoice.id,
            case when v_invoice.due_date < v_today and v_roll between 0.025 and 0.045
                 then round(v_invoice.total_ttc / 2, 2) else v_invoice.total_ttc end,
            (array['bank_transfer', 'bank_transfer', 'bank_transfer', 'check', 'check', 'card', 'bill_of_exchange',
                   'cash'])[1 + floor(random() * 8)::integer]::public.payment_method,
            v_paid, c_reception);
  end loop;

  -- Relance envoyée pour les deux plus anciennes factures en retard
  for v_invoice in
    select i.* from public.v_invoice_balances b join public.invoices i on i.id = b.invoice_id
    where b.payment_status = 'overdue' order by i.due_date limit 2
  loop
    insert into public.invoice_reminders (invoice_id, sent_at, sent_by)
    values (v_invoice.id, (v_invoice.due_date + 10 + time '10:00') at time zone 'Europe/Paris', c_reception);
  end loop;

  -- Pointages des 15 derniers jours ouvrés (arrivée vers 9 h, départ vers 18 h ; quelques retards)
  insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source)
  select t.id, e.kind::public.clock_event_type,
         (d::date + case e.kind
            when 'in' then time '08:48' + ((floor(random() * 14) + case when random() < 0.08 then 20 else 0 end) || ' minutes')::interval
            else time '18:00' + (floor(random() * 25) || ' minutes')::interval end) at time zone 'Europe/Paris',
         d::date, 'kiosk'
  from generate_series(v_today - 21, v_today - 1, interval '1 day') d
  cross join public.technicians t
  cross join (values ('in'), ('out')) e(kind)
  where extract(isodow from d) < 6 and t.is_active
    and not exists (select 1 from public.leave_requests l where l.technician_id = t.id and l.status = 'approved'
                    and d::date between l.starts_on and l.ends_on);
  -- Aujourd'hui : arrivées du matin
  insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source)
  select t.id, 'in', (v_today + time '08:52' + (floor(random() * 10) || ' minutes')::interval) at time zone 'Europe/Paris',
         v_today, 'kiosk'
  from public.technicians t
  where t.is_active and extract(isodow from v_today) < 6
    and (v_today + time '08:52') at time zone 'Europe/Paris' < now();

  perform set_config('session_replication_role', 'origin', true);

  -- Alertes de la cloche à jour
  perform set_config('request.jwt.claims', '', true);
  perform public.generate_alerts();
  perform public.pre_quote_work_alerts();
end;
$demo$;

select format('%s clients, %s véhicules, %s OR, %s factures (%s € HT), %s devis, %s rendez-vous',
              (select count(*) from public.clients), (select count(*) from public.vehicles),
              (select count(*) from public.repair_orders), (select count(*) from public.invoices where status = 'issued'),
              (select to_char(sum(total_ht), 'FM999G999G990') from public.invoices where status = 'issued'),
              (select count(*) from public.quotes), (select count(*) from public.appointments)) as "Données de démonstration";
