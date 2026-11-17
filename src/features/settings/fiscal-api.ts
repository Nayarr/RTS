import { supabase } from '@/lib/supabase';

/** Résultat de la vérification du journal fiscal chaîné (verify_fiscal_journal). */
export interface FiscalCheck {
  ok: boolean;
  ecritures: number;
  derniere_empreinte: string;
  verifie_le: string;
  erreurs: { seq: number | null; probleme: string; document?: string }[];
}

export interface FiscalArchive {
  id: string;
  period_from: string;
  period_to: string;
  entries_count: number;
  sha256: string;
  automatic: boolean;
  created_at: string;
}

export async function verifyFiscalJournal(): Promise<FiscalCheck> {
  const { data, error } = await supabase.rpc('verify_fiscal_journal');
  if (error) throw error;
  return data as unknown as FiscalCheck;
}

export async function fetchFiscalArchives(): Promise<FiscalArchive[]> {
  const { data, error } = await supabase
    .from('fiscal_archives')
    .select('id, period_from, period_to, entries_count, sha256, automatic, created_at')
    .order('period_from', { ascending: false })
    .order('period_to', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createFiscalArchive(from: string, to: string) {
  const { error } = await supabase.rpc('create_fiscal_archive', { p_from: from, p_to: to });
  if (error) throw error;
}

/** Texte exact de l'archive : son SHA-256 est l'empreinte affichée. */
export async function fetchFiscalArchiveContent(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('fiscal_archive_content', { p_id: id });
  if (error) throw error;
  return data;
}

export const archiveFileName = (archive: Pick<FiscalArchive, 'period_from' | 'period_to'>) =>
  `archive-fiscale-rts-${archive.period_from}-au-${archive.period_to}.json`;

/** Notice jointe aux archives (BOI-TVA-DECLA-30-10-30 § 230 : format ouvert et notice en français). */
export const ARCHIVE_NOTICE = `NOTICE DES ARCHIVES FISCALES - RTS Atelier
Éditeur : KYNES. (Rayan OUGHLIS, entrepreneur individuel, SIREN 107 222 333)

1. Objet
Chaque archive fige les écritures du journal fiscal d'une période close : factures émises, avoirs
et paiements (encaissements et annulations), avec leur contenu complet. Le logiciel crée une archive
automatiquement le 1er de chaque mois pour le mois précédent ; la direction ou le comptable peut aussi
archiver une période plus longue (l'exercice, par exemple). Une archive ne peut être ni modifiée ni
supprimée.

2. Format
Fichier JSON (UTF-8), format « rts-archive-fiscale/1 ». Champs principaux :
- periode.du, periode.au : dates de début et de fin (heure de Paris) ;
- generee_le : date et heure de création (UTC, ISO 8601) ;
- entreprise : raison sociale, SIRET et TVA intracommunautaire ;
- chainage : première et dernière écriture, empreinte précédant la période, dernière empreinte ;
- totaux_periode : factures TTC, avoirs TTC, encaissements TTC (total et par mode de règlement) ;
- total_perpetuel_ttc : factures moins avoirs, TTC, depuis la mise en service, jusqu'à la fin de la période ;
- ecritures : une entrée par écriture, dans l'ordre du journal.

Chaque écriture comporte : seq (numéro d'ordre continu), type (invoice = facture, credit_note = avoir,
payment = paiement ; un montant négatif est l'annulation d'un paiement, liée au paiement d'origine par
annule_paiement_id), document_id, numero, montant_ttc, date (UTC), auteur_id, contenu (la facture
avec ses mentions client, ses totaux et ses lignes ; l'avoir ; ou le paiement avec son mode et sa
date), empreinte_precedente et empreinte.

Modes de règlement : bank_transfer = virement, check = chèque, card = carte bancaire, cash = espèces,
bill_of_exchange = LCR, direct_debit = prélèvement.

3. Contrôle d'intégrité
- Empreinte de l'archive : SHA-256 du fichier tel que téléchargé, à comparer à l'empreinte affichée
  dans Réglages › Conformité fiscale (commande : sha256sum <fichier> ou certutil -hashfile <fichier> SHA256).
- Empreinte de chaque écriture : SHA-256 hexadécimal de la chaîne
  empreinte_precedente|seq|type|document_id|numero|montant_ttc|date|auteur_id|contenu
  (champ vide pour une valeur absente ; montant avec deux décimales ; contenu = texte JSON de
  l'écriture tel qu'il figure dans le fichier). La première écriture
  du journal a pour empreinte précédente 64 zéros. Chaque création d'archive entre elle-même dans
  le journal avec son empreinte : une archive ne peut pas être remplacée sans rompre la chaîne.
- Le bouton « Vérifier » de Réglages › Conformité fiscale recalcule toute la chaîne et compare chaque
  facture, avoir et paiement à son contenu journalisé.

4. Conservation
Les données sont conservées dans le logiciel sans limite de durée (au moins six ans, article L. 102 B
du livre des procédures fiscales). Téléchargez chaque archive sur un support externe (clé USB, disque,
espace de stockage de l'entreprise) en complément.
`;
