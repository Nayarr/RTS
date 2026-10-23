"""Reprise des clients et des véhicules de GTA PRO : export Excel + liste PDF -> scripts SQL.

    python -m pip install xlrd==2.0.1 pypdf==6.14.2
    python scripts/reprise/import-gta.py export_client.xls "LISTE VEHICULE.pdf" [reprise-gta]

Les deux fichiers viennent de GTA PRO : l'export des clients (Excel) et la liste des véhicules (PDF).

Produit dans le dossier de sortie (non versionné, il contient les données du client) :
  1-clients.sql    les clients (un par nom : les fiches en double de GTA sont fusionnées)
  2-vehicules.sql  les véhicules, rattachés à leur client
  rapport.txt      ce qui a été fusionné, rapproché ou laissé sans client, à vérifier

Les scripts SQL se passent sur une base purgée (scripts/reprise/purge-activite.sql) :
  npx supabase db query --linked -f reprise-gta/1-clients.sql
Rien n'est envoyé nulle part : ce script lit deux fichiers et en écrit d'autres.
"""

import difflib
import os
import re
import sys
from datetime import date

import xlrd
from pypdf import PdfReader
from pypdf.generic import ContentStream

TODAY = date.today()
OWN = {'RAPIDTRUCKSERVICE', 'CLIENTCOMPTOIR', 'CLIENTCOMTPOIRNEPLUSUTILISERPOURFACTURE'}
OBSOLETE = re.compile(r'NE (PAS|PLUS) UTILISER', re.I)
PDF_NAME_MAX = 23  # la liste PDF coupe le nom du client à 23 caractères

# Type de véhicule deviné à partir de la marque et du modèle (poids lourd par défaut)
TRAILER_BRANDS = {'SEMI-REMORQUE', 'SCHMITZ', 'FRUEHAUF', 'TROUILLET', 'KRONE', 'LAMBERET', 'CHEREAU', 'KOGEL'}
VAN_BRANDS = {'CITROEN', 'PEUGEOT', 'FIAT', 'OPEL', 'TOYOTA', 'AUDI', 'BMW', 'LAND ROVER', 'SANTANA', 'FORD',
              'VOLKSWAGEN', 'MITSUBISHI', 'ISUZU', 'NISSAN', 'DACIA', 'SKODA', 'SEAT', 'LEXUS'}
VAN_MODELS = re.compile(
    r'^(DAILY|MASTER|SPRINTER|CRAFTER|TRANSIT|DUCATO|KANGOO|EXPERT|BOXER|JUMPER|JUMPY|TRAFIC|VITO|TGE|'
    r'CANTER|CLIO|C3|C4|308|EVOQUE|LEXUS|SAFARI|MOVANO|VIVARO|PARTNER|BERLINGO|CADDY)\b')


def key(value):
    """Même clé que public.normalize_key : lettres et chiffres ASCII, en majuscules."""
    return re.sub(r'[^A-Za-z0-9]', '', value or '').upper()


def base_key(name):
    """Nom sans la mention de paiement : « BMK TRANSPORT (EN COMPTE) » -> BMKTRANSPORT."""
    return key(re.sub(r'\(.*?(\)|$)|\bEN COMPTE\b', ' ', name, flags=re.I))


def clean(value):
    if isinstance(value, float):
        value = str(int(value)) if value.is_integer() else str(value)
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def sql(value):
    if value is None or value == '':
        return 'null'
    return "'" + str(value).replace("'", "''") + "'"


def format_phone(digits):
    if len(digits) == 10 and digits.startswith('0'):
        return ' '.join(digits[i:i + 2] for i in range(0, 10, 2))
    return digits


def phones_of(raw):
    """« 0767822680 RAFIK » -> ([« 07 67 82 26 80 »], « RAFIK »)."""
    text = clean(raw)
    numbers = []
    for match in re.finditer(r'(\+?\d[\d .]{7,}\d)', text):
        digits = re.sub(r'\D', '', match.group(1))
        if digits.startswith('33') and len(digits) == 11:
            digits = '0' + digits[2:]
        numbers.append(format_phone(digits)[:30])
    rest = clean(re.sub(r'(\+?\d[\d .]{7,}\d)', ' ', text)).strip(' -/:,')
    return numbers, rest


def valid_siret(value):
    if not re.fullmatch(r'\d{14}', value):
        return False
    if value.startswith('356000000'):
        return sum(int(c) for c in value) % 5 == 0
    total = 0
    for i, c in enumerate(value, start=1):
        n = int(c)
        if (14 - i) % 2 == 1:
            n = n * 2 - (9 if n >= 5 else 0)
        total += n
    return total % 10 == 0


def format_plate(value):
    """Format SIV « AB-123-CD » quand la plaque y correspond, sinon telle quelle (comme l'appli)."""
    k = key(value)
    if re.fullmatch(r'[A-Z]{2}\d{3}[A-Z]{2}', k):
        return f'{k[:2]}-{k[2:5]}-{k[5:]}'
    return re.sub(r'\s+', ' ', value.upper()).strip()


def gta_date(value, past=False):
    m = re.fullmatch(r'(\d\d)/(\d\d)/(\d\d)', value or '')
    if not m:
        return None
    day, month, year = int(m[1]), int(m[2]), 2000 + int(m[3])
    if past and year > TODAY.year:
        year -= 100
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Clients : export Excel de GTA PRO
# ---------------------------------------------------------------------------

def read_clients(path):
    sheet = xlrd.open_workbook(path, logfile=open(os.devnull, 'w')).sheet_by_index(0)
    header = [clean(h).lower() for h in sheet.row_values(1)]
    expected = ['nom/prénom', 'adresse', 'adresse suite', 'code postal', 'ville', 'téléphone', 'portable',
                'compte comptable', 'e-mail', 'refuse les démarches commerciales', 'tva intra.', 'siret']
    if header != expected:
        sys.exit(f'Colonnes inattendues dans {path} : {header}')
    rows = []
    for r in range(2, sheet.nrows):
        (name, address, address2, postcode, city, phone, mobile, account, email, refuses, vat,
         siret) = [clean(v) for v in sheet.row_values(r)]
        if not key(name):
            continue
        rows.append(dict(name=name, address=address, address2=address2, postcode=postcode, city=city,
                         phone=phone, mobile=mobile, account=account, email=email,
                         refuses=refuses.lower() == 'oui', vat=vat, siret=re.sub(r'\D', '', siret)))
    return rows


def build_client(group, report):
    """Une fiche par nom : la plus complète, complétée par les autres fiches GTA du même nom."""
    group = sorted(group, key=lambda c: -sum(1 for v in c.values() if v))
    main = group[0]
    phones, contacts, emails, notes = [], [], [], []
    for c in group:
        for raw, label in ((c['mobile'], 'Portable'), (c['phone'], 'Fixe')):
            numbers, rest = phones_of(raw)
            for n in numbers:
                if n not in (p for p, _ in phones):
                    phones.append((n, label))
            if rest and not key(rest).isdigit():
                contacts.append(rest)
        for e in re.split(r'[;,\s/]+', c['email']):
            if re.fullmatch(r'[^@\s]+@[^@\s]+\.[A-Za-z]{2,}', e) and e.lower() not in emails:
                emails.append(e.lower())
    address = [main['address'], main['address2'], clean(f"{main['postcode']} {main['city']}")]
    siret = next((c['siret'] for c in group if c['siret']), '')
    if siret and not valid_siret(siret):
        notes.append(f"{'SIREN' if len(siret) == 9 else 'SIRET'} dans GTA PRO : {siret}")
        if len(siret) != 9:
            report['siret'].append(f"{main['name']} : {siret}")
        siret = ''
    vat = next((c['vat'] for c in group if c['vat']), '')
    if vat:
        notes.append(f'TVA intracommunautaire : {vat}')
    if any(c['refuses'] for c in group):
        notes.append('Refuse les démarches commerciales.')
    if len(emails) > 1:
        notes.append('Autres e-mails : ' + ', '.join(emails[1:]))
    accounts = [c['account'] for c in group if c['account']]
    notes.append('Compte comptable GTA : ' + ', '.join(accounts))
    if len(group) > 1:
        report['fusion'].append(f"{main['name']} : {len(group)} fiches ({', '.join(accounts)})")
    other = [{'label': label, 'phone': n} for n, label in phones[1:11]]
    return dict(
        name=main['name'][:200],
        legacy_key=f'GTA-{accounts[0]}' if accounts else None,
        email=emails[0] if emails else None,
        phone=phones[0][0] if phones else None,
        contact_name=contacts[0][:120] if contacts else None,
        other_phones=other,
        billing_address='\n'.join(line for line in address if line)[:300] or None,
        siret=siret or None,
        notes='\n'.join(notes)[:2000],
    )


def clients_sql(clients, source):
    values = []
    for c in clients:
        phones = ', '.join(
            "jsonb_build_object('label', {}, 'phone', {})".format(sql(p['label']), sql(p['phone']))
            for p in c['other_phones'])
        values.append('  ({}, {}, {}, {}, {}, {}, {}, {}, {})'.format(
            sql(c['name']), sql(c['legacy_key']), sql(c['email']), sql(c['phone']), sql(c['contact_name']),
            f'jsonb_build_array({phones})', sql(c['billing_address']), sql(c['siret']), sql(c['notes'])))
    return (f'-- Reprise des clients de GTA PRO ({source}) : {len(clients)} clients.\n'
            '-- À passer sur une base purgée (scripts/reprise/purge-activite.sql).\n'
            'begin;\n'
            'do $$\n'
            'begin\n'
            '  if exists (select 1 from public.clients) then\n'
            "    raise exception 'La base contient déjà des clients : lancer d''abord "
            "scripts/reprise/purge-activite.sql';\n"
            '  end if;\n'
            'end;\n'
            '$$;\n'
            'insert into public.clients\n'
            '  (name, legacy_key, email, phone, contact_name, other_phones, billing_address, siret, notes)\n'
            'values\n' + ',\n'.join(values) + ';\ncommit;\n')


# ---------------------------------------------------------------------------
# Véhicules : liste PDF de GTA PRO (une ligne par véhicule, colonnes à position fixe)
# ---------------------------------------------------------------------------

FIELDS = ['plate', 'mec', 'brand', 'model', 'code', 'energy', 'power', 'km', 'ct', 'client']


def read_vehicles(path):
    reader = PdfReader(path)
    vehicles = []
    for page in reader.pages:
        ops = ContentStream(page.get_contents(), reader).operations
        cells = [float(o[0]) + 28.346 for o, op in ops if op == b're' and abs(float(o[3]) - 26.694) < 0.01]
        bounds = sorted({round(x, 1) for x in cells})[1:]  # bord gauche de chaque colonne après la plaque
        if len(bounds) != len(FIELDS) - 1:
            sys.exit(f'Mise en page inattendue dans {path} (colonnes : {bounds})')
        runs, current = [], None
        for operands, op in ops:
            if op == b'BT':
                current = None
            elif op == b'Td' and current is None:
                current = [float(operands[0]), float(operands[1]), '']
                runs.append(current)
            elif op in (b"'", b'Tj') and current is not None:
                text = operands[0]
                current[2] += text if isinstance(text, str) else text.decode('latin-1')
        rows = {}
        for x, y, text in runs:
            rows.setdefault(round(y), []).append((x, text))
        header = max((y for y, row in rows.items() if any(t == 'Immatr.' for _, t in row)), default=None)
        for y in sorted(rows, reverse=True):
            if header is None or y >= header:
                continue
            record = dict.fromkeys(FIELDS, '')
            for x, text in sorted(rows[y]):
                field = FIELDS[sum(1 for b in bounds if x >= b)]
                record[field] = clean(f'{record[field]} {text}'.replace('\xa0', ' ').replace('\x80', ' '))
            vehicles.append(record)
    return vehicles


def vehicle_type(v):
    brand, model = v['brand'].upper(), v['model'].upper()
    if brand in TRAILER_BRANDS or 'REMORQUE' in model:
        return 'remorque'
    if brand in VAN_BRANDS or VAN_MODELS.match(model):
        return 'vul'
    return 'pl'


def richness(v):
    return sum(1 for f in FIELDS if v[f] and v[f] != '__/__/__')


def merge_vehicles(group, report):
    """Même plaque écrite de deux façons (« CM-485-KV » et « CM485KV ») : une seule fiche."""
    group = sorted(group, key=lambda v: (key(v['client']) in OWN, -richness(v)))
    merged = dict(group[0])
    for v in group[1:]:
        for f in FIELDS:
            if not merged[f] or merged[f] == '__/__/__':
                merged[f] = v[f]
    cts = [d for d in (gta_date(v['ct']) for v in group) if d]
    merged['ct'] = max(cts) if cts else ''
    clients = sorted({v['client'] for v in group if v['client']})
    if len(clients) > 1:
        report['plaque'].append(f"{format_plate(merged['plate'])} : {' / '.join(clients)} -> {merged['client']}")
    return merged


def match_client(name, vtype, index, report):
    k = key(name)
    if not k:
        return None
    if k in index:
        return index[k]
    candidates = [c for ck, c in index.items() if ck.startswith(k)] if len(name) >= PDF_NAME_MAX - 3 else []
    if not candidates:
        candidates = [c for c in index.values() if base_key(c['name']) == base_key(name)]
    if len(candidates) > 1:
        current = [c for c in candidates if not OBSOLETE.search(c['name'])]
        candidates = current or candidates
    if len(candidates) > 1:
        suffix = ' VL' if vtype == 'vul' else ' PL'
        by_type = [c for c in candidates if c['name'].upper().endswith(suffix)]
        candidates = by_type if len(by_type) == 1 else candidates
    if len(candidates) == 1:
        return candidates[0]
    close = difflib.get_close_matches(k, index.keys(), n=2, cutoff=0.88) if len(k) >= 8 and not candidates else []
    if len(close) == 1 or (len(close) == 2 and difflib.SequenceMatcher(None, k, close[0]).ratio() >
                           difflib.SequenceMatcher(None, k, close[1]).ratio() + 0.05):
        report['rapproche'].add(f"{name} -> {index[close[0]]['name']}")
        return index[close[0]]
    report['sans_client'].add(name + (f" (plusieurs clients : {', '.join(c['name'] for c in candidates)})"
                                      if candidates else ''))
    return None


def vehicles_sql(vehicles, source):
    values = []
    for v in vehicles:
        client = f"(select id from public.clients where legacy_key = {sql(v['legacy_key'])})" \
            if v['legacy_key'] else 'null'
        values.append('  ({}, {}, {}::public.vehicle_type, {}, {}, {}, {}, {})'.format(
            sql(v['plate']), client, sql(v['type']), sql(v['brand']), sql(v['model']),
            sql(v['first_registration']), sql(v['ct']), sql(v['notes'])))
    return (f"-- Reprise des véhicules de GTA PRO ({source}) : {len(vehicles)} véhicules.\n"
            "-- À passer après 1-clients.sql.\n"
            "begin;\n"
            "insert into public.vehicles\n"
            "  (plate, client_id, vehicle_type, brand, model, first_registration_date, ct_due_date, notes)\n"
            "values\n" + ',\n'.join(values) + ';\ncommit;\n')


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    clients_path, vehicles_path = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else 'reprise-gta'
    os.makedirs(out, exist_ok=True)
    report = {'fusion': [], 'siret': [], 'plaque': [], 'rapproche': set(), 'sans_client': set()}

    groups = {}
    for row in read_clients(clients_path):
        groups.setdefault(key(row['name']), []).append(row)
    clients = [build_client(g, report) for g in groups.values()]
    index = {key(c['name']): c for c in clients}

    by_plate = {}
    for v in read_vehicles(vehicles_path):
        if key(v['plate']):
            by_plate.setdefault(key(v['plate']), []).append(v)
    vehicles, types = [], {'pl': 0, 'vul': 0, 'remorque': 0}
    for group in by_plate.values():
        v = merge_vehicles(group, report) if len(group) > 1 else dict(group[0], ct=gta_date(group[0]['ct']) or '')
        vtype = vehicle_type(v)
        types[vtype] += 1
        client = match_client(v['client'], vtype, index, report)
        notes = []
        km = re.sub(r'\D', '', v['km'])
        if km:
            notes.append(f"Kilométrage dans GTA PRO : {int(km):,} km".replace(',', ' '))
        if v['client'] and not client:
            notes.append(f"Client dans GTA PRO : {v['client']}")
        vehicles.append(dict(
            plate=format_plate(v['plate']), legacy_key=client['legacy_key'] if client else None, type=vtype,
            brand=v['brand'] if v['brand'] != 'SEMI-REMORQUE' else None,
            model=v['model'] or None, first_registration=gta_date(v['mec'], past=True), ct=v['ct'] or None,
            notes='\n'.join(notes) or None))

    source = f'{os.path.basename(clients_path)}, {os.path.basename(vehicles_path)}'
    with open(os.path.join(out, '1-clients.sql'), 'w', encoding='utf-8') as f:
        f.write(clients_sql(clients, source))
    with open(os.path.join(out, '2-vehicules.sql'), 'w', encoding='utf-8') as f:
        f.write(vehicles_sql(vehicles, source))

    linked = sum(1 for v in vehicles if v['legacy_key'])
    lines = [
        f'Clients : {len(clients)} (export : {sum(len(g) for g in groups.values())} fiches)',
        f"Véhicules : {len(vehicles)} ({types['pl']} PL, {types['vul']} VUL, {types['remorque']} remorques), "
        f'{linked} rattachés à un client, {len(vehicles) - linked} sans client',
        '', 'Fiches clients fusionnées (même nom dans GTA) :', *[f'  {x}' for x in report['fusion']],
        '', 'SIRET invalides (gardés dans les notes ; les SIREN à 9 chiffres aussi) :', *[f'  {x}' for x in report['siret']],
        '', 'Plaques en double dans la liste (une seule fiche gardée) :', *[f'  {x}' for x in report['plaque']],
        '', 'Clients rapprochés malgré une faute de frappe :', *[f'  {x}' for x in sorted(report['rapproche'])],
        '', 'Véhicules sans client (nom gardé dans les notes du véhicule) :',
        *[f'  {x}' for x in sorted(report['sans_client'])],
    ]
    with open(os.path.join(out, 'rapport.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print('\n'.join(lines[:2]))
    print(f'Scripts SQL et rapport dans {out}/')


if __name__ == '__main__':
    main()
