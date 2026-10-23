# Reprise des clients et des véhicules de GTA PRO

Deux fichiers de GTA PRO : l'export des clients (`export_client.xls`) et la liste des véhicules
(`LISTE VEHICULE.pdf`). Les commandes se lancent depuis la racine du projet, lié au projet Supabase
visé (`npx supabase link`).

## 1. Sauvegarde

```bash
npx supabase db dump --linked --data-only -f reprise-gta/sauvegarde-avant-reprise.sql
```

## 2. Remise à zéro de l'activité

Avant de lancer, mettre dans `scripts/reprise/purge-activite.sql` le dernier numéro de facture
émis dans GTA PRO (`DERNIERE_FACTURE_GTA`) : la première facture de l'appli prend le numéro suivant.

```bash
npx supabase db query --linked -f scripts/reprise/purge-activite.sql
```

Effacé : clients, véhicules, OR, devis, factures, avoirs, paiements, relances, rendez-vous, contrats,
locations, permis, messages, mails reçus, notifications, historique de l'Agent, pointages, congés,
stock des pneus, mouvements des consommables. Gardé : comptes, techniciens, réglages, tarifs,
forfaits, pièces, consommables, fournisseurs, dimensions de pneus, flotte de location, base de
connaissances. Les fichiers des données effacées sont effacés de R2 par la tâche de nuit.

## 3. Conversion des fichiers de GTA PRO

```bash
python -m pip install xlrd==2.0.1 pypdf==6.14.2
python scripts/reprise/import-gta.py export_client.xls "LISTE VEHICULE.pdf"
```

Le dossier `reprise-gta/` (non versionné) reçoit `1-clients.sql`, `2-vehicules.sql` et
`rapport.txt`. Le rapport liste ce qu'il faut vérifier :

- fiches clients en double dans GTA (même nom) : fusionnées en une seule, les comptes comptables
  et les autres numéros gardés ;
- SIRET invalides et SIREN à 9 chiffres : gardés dans les notes du client ;
- plaques écrites de deux façons (`CM-485-KV` et `CM485KV`) : une seule fiche ;
- clients rapprochés malgré une faute de frappe (`LDR TRANDPORT` -> `LDR TRANSPORT`) ;
- véhicules sans client : le nom de GTA est gardé dans les notes du véhicule.

Le type de véhicule (PL, VUL, remorque) est déduit de la marque et du modèle, poids lourd par
défaut. Le kilométrage de GTA est gardé dans les notes du véhicule.

## 4. Import

```bash
npx supabase db query --linked -f reprise-gta/1-clients.sql
npx supabase db query --linked -f reprise-gta/2-vehicules.sql
```

Le script des clients refuse de tourner si la base contient déjà des clients.
