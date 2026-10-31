/**
 * Aide intégrée : reprise de l'ancienne appli, réécrite avec les écrans et
 * libellés de la nouvelle. Chaque sujet = un titre + des explications courtes.
 */
export interface HelpTopic {
  title: string;
  items: string[];
}

export const TECHNICIAN_TOPICS: HelpTopic[] = [
  {
    title: 'Démarrer un OR',
    items: [
      'Ouvre l’OR dans « Mes ordres de réparation » (triés par heure prévue). Les étiquettes « Nouveau » et « Modifié » signalent un OR qui vient de t’être assigné ou dont le programme a changé.',
      'Prends les photos obligatoires : face avant, côté gauche, côté droit, arrière, tableau de bord (pas de tableau de bord pour une remorque). Le kilométrage est facultatif et s’enregistre tout seul pendant la saisie.',
      'Appuie sur « Démarrer le badgeage » pour lancer le chrono. « Mettre en pause » l’arrête ; tu le relances avec le même bouton.',
    ],
  },
  {
    title: 'Fiche de contrôle',
    items: [
      'Choisis OK, 50 % ou HS pour chaque élément : la fiche est enregistrée automatiquement. Un élément HS ou à 50 % ajoute tout seul la ligne « Remplacement … » dans les travaux à prévoir, avec ton temps estimé à donner.',
      'Pneus : avant et arrière. Pour un camion à plus d’essieux ou une remorque, « Ajouter un essieu » (pas sur un utilitaire). Tape la taille en chiffres (31570225) : les barres et le point se mettent tout seuls.',
      'Photographie les étiquettes (contrôle hayon, extincteurs) avec le bouton appareil photo à côté de chacune.',
      'Niveaux (lave-glace, liquide de refroidissement, huile) : en fin de fiche. « Niveau bon », ou l’appoint fait avec les litres ajoutés.',
      'Dans « Échéances du véhicule », renseigne les dates du contrôle technique et du contrôle hayon lues sur le camion. La photo du contrôle technique est obligatoire pour terminer l’OR, sauf pour une remorque (facultative).',
    ],
  },
  {
    title: 'Travaux effectués / à prévoir',
    items: [
      '« Travaux effectués » : ce que tu as réellement fait. C’est ce qui sera facturé.',
      'La mission donnée par le bureau y est déjà (une tâche par ligne) : donne ton temps, ajoute ce que tu as fait en plus, retire ce qui n’a pas été fait.',
      '« Pièces / réparations à prévoir (devis) » : ce qu’il faudra faire plus tard. Cela sert au devis.',
      'Indique ton temps estimé pour chaque ligne : chaque temps part de « Estimation », à toi de choisir.',
    ],
  },
  {
    title: 'Terminer',
    items: [
      'Quand tout est fait, réponds à « Devis nécessaire ? » (OUI / NON) puis appuie sur « Travaux terminés ». L’OR est alors verrouillé et quitte ta liste ; tu le retrouves pendant 7 jours avec « Voir mes OR terminés ».',
      'Un oubli ? Demande à la direction de débloquer l’OR.',
    ],
  },
  {
    title: 'Pointage et congés',
    items: [
      'Chaque jour, pointe ton arrivée et ton départ sur la borne avec ton code PIN (la borne te prend en photo).',
      'Pour changer ton code PIN : « Changer mon code » sous le clavier de la borne, tape ton code actuel puis le nouveau deux fois. Code oublié : demande à la direction (Équipe).',
      'Pour un congé, ouvre l’onglet « Congés » en bas, puis « Demander un congé » : jours entiers, matin, après-midi ou quelques heures. La direction valide ou refuse.',
    ],
  },
];

export const OFFICE_TOPICS: HelpTopic[] = [
  {
    title: 'Créer un OR',
    items: [
      'Onglet « Ordres de réparation », puis « Nouvel OR » : immatriculation, client, travaux demandés, type de véhicule, technicien. Les plaques et les clients déjà connus sont proposés pendant la saisie.',
      'Chaque ligne des travaux demandés devient une tâche des travaux effectués du technicien, qui n’a plus qu’à donner son temps.',
      'Client pas encore en base : sa fiche s’affiche dans l’OR et se remplit entièrement (téléphone, e-mail, adresse…). Le client est créé avec l’OR, et son e-mail sert aux envois (signature, devis, facture).',
      'Tu peux laisser l’OR sans technicien (badge « Non assigné ») et l’assigner plus tard, depuis l’OR ou le planning. Les informations de l’OR s’enregistrent toutes seules.',
      'Pour un dépannage, choisis le type d’intervention « Dépannage » : déplacement, kilomètres et temps de trajet sont ajoutés à la facture.',
      'Dépannage extérieur : carte « Lieu d’intervention » de l’OR (à la création ou sur sa fiche), coche « Dépannage extérieur », tape l’adresse et choisis-la dans la liste, puis « Calculer le trajet » (distance et temps aller-retour, trafic compris ; modifiables). Le déplacement facturé suit la zone (Réglages › Atelier) : zone 1 moins de 10 km aller-retour 60 € HT, zone 2 jusqu’à 20 km 90 €, zone 3 jusqu’à 40 km 130 € ; au-delà, prix à saisir. Trajet plus long que celui de la zone (zone 1 : 30 min ; zone 2 : 1 h ; zone 3 : 1 h 30, 7 min de tolérance) : temps de trajet facturé, 1 h au moins puis à la minute. Le mécano voit le lieu et un lien « Itinéraire ».',
    ],
  },
  {
    title: 'Planning et rendez-vous',
    items: [
      'Vue Semaine ou Jour, une colonne par technicien. Clique dans une case vide pour y assigner un OR.',
      '« Nouveau rendez-vous » pour un véhicule attendu. À son arrivée, ouvre le rendez-vous puis « Créer l’OR ». La veille, envoie le rappel au client (la cloche te le rappelle).',
      '« En direct » montre les véhicules actuellement à l’atelier et le badgeage en cours.',
      'Rappels et échéances automatiques (Réglages, onglet « Atelier », avec l’envoi depuis l’appli) : le client reçoit le rappel la veille de son rendez-vous, et 48 h avant un contrôle technique, hayon ou antipollution (ou quand l’entretien d’un contrat est à refaire) un e-mail avec un lien pour choisir un créneau. Sa demande arrive dans « Rendez-vous », « Demandes en ligne » : « Confirmer » lui envoie la confirmation par e-mail.',
      'Les absences sont en gris dans le planning ; une absence de quelques heures (matin, après-midi, rendez-vous) apparaît sur sa plage horaire.',
      'Accueil, « Charge de travail atelier » : heures déclarées sur les OR, heures disponibles, présence badgée à la borne et l’écart (heures de présence sans temps déclaré sur un OR). Clique sur un technicien pour voir d’où viennent ses heures.',
    ],
  },
  {
    title: 'Mon agenda',
    items: [
      'Menu « Mon agenda », sous « Mails reçus » : ton calendrier personnel, comme Outlook. Personne d’autre ne voit tes rendez-vous, direction comprise.',
      'Vues Jour, Semaine ou Mois ; le petit calendrier à gauche change de jour et liste ses rendez-vous. Clique dans une case vide de la grille pour poser un rendez-vous à cette heure, ou sur un rendez-vous pour le modifier ou le supprimer.',
      '« Journée entière » pour un jour ou plusieurs (salon, congé, déplacement) : il s’affiche en haut de la grille.',
    ],
  },
  {
    title: 'Devis',
    items: [
      'Sur l’OR, « Préparer le devis » reprend les travaux à prévoir, calcule la main d’œuvre au taux horaire et applique les forfaits. Ajoute pièces, main d’œuvre, texte et remises.',
      '« Envoyer au client (lien à signer) » prépare un lien : le client consulte et signe en ligne, le devis passe seul en « Accepté ».',
      'Devis accepté (en ligne, sur la borne ou au bureau) : l’OR d’origine passe « Facture à faire » ; « Créer l’OR avec les travaux acceptés » et choisis le technicien.',
      'Forfaits des pneus (devis et facture seulement) : sur la fiche OR, affichés avec leur quantité et leur prix unitaire (« 2 × 18,00 € HT »), leur temps de barème ne compte pas.',
      'Devis avec le contrôle du hayon : dès qu’il est envoyé (ou accepté au bureau), l’échéance du hayon du véhicule passe à 6 mois plus tard, le rappel ne part donc pas. Sur la fiche véhicule, « Renouvelé (+6 mois) » fait de même à la main.',
      'Devis envoyé resté sans réponse : le dernier jour travaillé du mois (samedi compris) à 8 h, la réception et la direction sont prévenues, et l’OR d’origine passe « Facture à faire » pour facturer le travail déjà fait. Le devis reste signable par le client.',
      'Travaux déjà faits avant le devis (diagnostic, contrôle) : dès que le devis est accepté, choisis pour chaque ligne « Facturer » (facture séparée émise tout de suite, prix modifiable) ou « Offrir » (visible sur la facture avec 100 % de remise). Un bandeau orange reste sur l’OR tant que ce n’est pas fait.',
    ],
  },
  {
    title: 'Facturer',
    items: [
      'Sur l’OR, « Facturer » prépare un brouillon avec les travaux effectués, les pièces, les consommables, la sous-traitance et le déplacement. Vérifie, ajuste, puis « Émettre la facture ».',
      '« Aperçu pro forma » produit une facture pro forma sans numéro (quantités de main d’œuvre sans l’unité « h »).',
      'Une facture émise ne se modifie plus : pour la corriger, « Générer un avoir », puis une nouvelle facture si besoin.',
      'Sur la facture : « Enregistrer un paiement » (même partiel), « Envoyer au client » pour le lien en ligne, « Relancer » quand elle est en retard.',
      'Moyens de paiement : virement, chèque, carte bancaire, espèces, prélèvement (la LCR / traite n’est plus proposée ; les anciens paiements en LCR restent affichés).',
      'RIB : saisis l’IBAN et le BIC dans Réglages › Entreprise ; ils s’impriment sur chaque facture (PDF et facture en ligne) pour le règlement par virement.',
      'Paiement en plusieurs fois : enregistre chaque paiement à part (50 € en carte, puis 20 € en espèces…) avec son mode et sa date ; la facture garde qui l’a saisi et à quelle heure, et reste dans « Partiel » de la liste des factures jusqu’au dernier euro. Le mode proposé suit le type de compte du client (comptant ou prélèvement, sur sa fiche).',
      '« Relancer les retards » (liste des factures) : un mail par client avec toutes ses factures en retard et leurs liens, envoyé depuis l’adresse de facturation (ou ouvert dans ta messagerie si l’envoi par l’appli est coupé) ; chaque facture garde la relance.',
      '« Modifier l’échéance » sur une facture émise déplace sa date d’échéance (jamais avant l’émission) : l’ancienne date et la nouvelle restent affichées sur la facture.',
      'Plusieurs OR d’un même client ? Fiche client, puis « Facture groupée ».',
      'Facture sans TVA : sur le brouillon, carte « TVA », coche « Sans TVA » (toutes les lignes à 0 %, mention d’exonération modifiable). Client étranger : saisis son n° de TVA sur sa fiche et « Vérifier » (Union européenne : vérifié auprès de VIES ; hors Union : format contrôlé) ; ses factures partent alors sans TVA d’office, avec son n° et la mention (réglables dans Réglages › Facturation).',
      'Direction, carte « Salariés des lignes » de la facture : le salarié de chaque ligne (repris de l’OR : le technicien qui a fait la tâche) se change dans la liste de tous les employés, même sur une facture émise ; chaque changement est gardé. Interne : il n’apparaît ni sur le PDF, ni sur la facture du client.',
      'OR passé d’un technicien à l’autre : le badgeage en cours de l’ancien s’arrête ; chaque tâche garde le technicien qui a saisi son temps, et la charge de travail compte les heures de chacun.',
      'Fiche client, carte Factures, « Extrait de compte » : relevé des factures émises sur la période choisie (date, n° de facture, immatriculation, marque, modèle, HT, TVA, TTC, réglé, reste dû, état). Coche les états voulus (impayées, partielles, payées, avoirs) : les totaux suivent ; clique sur un titre de colonne pour trier.',
      'Depuis l’extrait : « PDF de l’extrait », « Factures en un PDF » (l’extrait puis chaque facture du tableau à la suite, pour un client qui doit plusieurs factures) ou « Factures en ZIP » (un PDF par facture).',
      'Direction, liste des factures, « Exporter » : factures émises sur une période (date de facture), pour un client ou tous, avec les états voulus (impayées, partielles, payées), en CSV pour la comptabilité, en un seul PDF ou en ZIP (un PDF par facture).',
    ],
  },
  {
    title: 'Informer le client',
    items: [
      'Sur l’OR, carte « Informer le client » : « Véhicule pris en charge », « Devis disponible », « Véhicule prêt ». Le bouton en vert est celui conseillé ; une coche indique un message déjà envoyé.',
      'L’appli prépare le message ; il part par ta messagerie (e-mail) ou ton téléphone (SMS). Chaque envoi est noté dans l’historique de l’OR.',
      'Fiche client : « Espace client en ligne » envoie au client un lien permanent vers ses véhicules, devis et factures. « Changer le lien » désactive l’ancien.',
      'Clients › Échéances : « Relancer les échéances » rédige un mail par client pour tous ses véhicules au contrôle dépassé ou dans les 30 jours. Un véhicule relancé (par ce bouton, par l’Agent Direction ou par le rappel automatique) ne se relance plus pendant 3 mois : « Relancé le … » s’affiche sur sa ligne.',
      'Renseigne une fois l’e-mail, le téléphone, l’adresse et le SIRET du client : ils sont repris partout.',
      'Réception : « Agent Direction » (en haut du menu) répond aux questions sur l’atelier (OR, rendez-vous, devis, factures, clients, échéances, locations), en lecture seule. La seule chose qu’il prépare pour toi : des mails, un seul (« relance Martin pour ses factures en retard ») ou un par client (« écris à chaque client dont le contrôle technique arrive à échéance »). Tu les relis un par un, tu les modifies, puis « Envoyer » ou « Ne pas envoyer ». « Mails reçus » (sous « Agent Direction ») : les mails des boîtes de l’atelier triés par l’agent ; ouvre-les, coche-les traités, relis la réponse préparée puis envoie-la ou remets-la à plus tard. Chiffre d’affaires, trésorerie, équipe, stock et réglages restent à la direction.',
    ],
  },
  {
    title: 'Pièces, garanties, sous-traitance',
    items: [
      'Pièces de l’OR : suis leur commande (À commander, Commandée, Reçue). « Attente pièces » s’affiche tant qu’elles ne sont pas reçues.',
      '« Retour » sur une pièce pour déclarer une garantie ou un retour fournisseur ; suivi dans l’onglet « Garanties ».',
      '« Confier un travail à un prestataire » (sous-traitance) : il est refacturé avec ta marge.',
    ],
  },
  {
    title: 'Rechercher',
    items: [
      '« Rechercher » en haut de l’écran (ou Ctrl + K) : immatriculation, client, n° d’OR, de devis ou de facture. Entrée ouvre le premier résultat.',
      'Fiche archivée par la direction (client ou véhicule) : hors des listes et de la recherche, son historique reste ; elle revient d’elle-même au prochain OR. Direction : « Archiver » sur la fiche, « Restaurer » sur la fiche ou dans Réglages › Archives ; « Supprimer » seulement pour une fiche sans OR, devis ni facture.',
      'Véhicule racheté par un autre client : « Transférer à un autre client » sur la fiche véhicule. Il passe chez le nouveau propriétaire, l’historique reste entier sur la fiche (propriétaires successifs, client de chaque passage) ; les OR, devis et factures déjà faits restent à l’ancien, qui le retrouve dans « Véhicules cédés » de sa fiche. Le véhicule sort de son contrat d’entretien.',
    ],
  },
];

export const DIRECTION_TOPICS: HelpTopic[] = [
  {
    title: 'Équipe',
    items: [
      '« Équipe » : ajoute les techniciens et les comptes, définis le code PIN de pointage, exclus un technicien du planning si besoin.',
      '« Pointages » : présences du jour avec photos, corrections, validation des congés, relevé d’heures mensuel pour la paie.',
      '« Pilotage », onglet « Performance » : note sur 100 par technicien (rendement, occupation, CA, précision des estimations).',
    ],
  },
  {
    title: 'Réglages importants',
    items: [
      '« Stock », onglet « Forfaits » : donne à chaque forfait sa catégorie (PL, VUL…) et des mots-clés précis, par exemple « disque avant, plaquette avant ».',
      'Un forfait peut aussi être déclenché par n’importe quelle case de la fiche de contrôle (usure, pneus, contrôles, voyants), sauf les niveaux. Disques à refaire : le forfait des disques remplace celui des plaquettes du même essieu.',
      'Pneus à 50 % ou HS : le technicien a la ligne « Remplacement Pneus avant / arrière / essieu N » ; le devis et la facture reprennent à la place une ligne par prestation (dépose/repose roue, dépose/repose pneumatique, recyclage) au prix unitaire, en quantité 2 à l’avant et pour chaque essieu ajouté, 4 à l’arrière ; poids lourd, pneus avant : équilibrage en quantité 2 en plus. La ligne « Remplacement Pneus » n’y figure pas. Barème : 30 min à l’avant, 1 h à l’arrière d’un poids lourd, 30 min à l’arrière d’un utilitaire. Prix unitaires, libellés, temps de barème et « Devis et facture seulement » se changent dans « Stock », onglet « Forfaits ».',
      '« Stock », onglet « Consommables » : produits en vrac, prix et stock ; une alerte signale un stock sous le seuil.',
      '« Pneumatiques », dans le menu (au même niveau que « Stock ») : le stock se compte par taille et profil (avant, arrière, remorque, multi-positions ; toutes positions pour un utilitaire), quelle que soit la marque. « Entrée de pneus » ajoute un arrivage (taper 31580225 suffit pour la taille, les indices de charge et de vitesse sont facultatifs) ; même marque, modèle et état qu’un pneu existant : sa quantité et ses prix sont mis à jour. Le seuil mini se change sur chaque ligne : en dessous, la ligne passe « À commander » (ou « Rupture ») et la direction et la réception reçoivent une alerte. Les pneus au devis ou sur un OR sont réservés ; ils sortent du stock quand la facture est émise. La fiche d’un pneu garde ses mouvements ; « Sortie / correction » demande toujours un motif. « Demander un chiffrage » reprend les tailles sous le seuil avec la quantité qui manque (modifiable) et prépare un mail sans marque pour un ou plusieurs fournisseurs (un envoi chacun) ; les e-mails des fournisseurs se règlent dans « Fournisseurs ». Sur un devis ou une facture, « Pneus du stock » propose les pneus de la taille relevée sur la fiche de contrôle (le profil de la position d’abord, puis les multi-positions) : la ligne ajoutée réserve les pneus.',
      'Borne de pointage et écran atelier (télé) : choisis d’abord le code de sortie dans « Pointages ». Sur la borne, la roue ⚙ et ce code permettent de quitter ou de passer en écran télé. Le code de sortie se change dans « Pointages » (« Changer le code ») ; les techniciens changent eux-mêmes leur code PIN sur la borne.',
      'Sauvegarde : automatique chaque nuit, chiffrée chez l’hébergeur (30 jours de copies de la base, photos et PDF gardés). Rien à faire dans l’appli.',
    ],
  },
  {
    title: 'Pilotage',
    items: [
      'Statistiques, Trésorerie (encaissé, à encaisser, retards, habitudes de paiement), Rentabilité par client et véhicule, Performance des techniciens.',
      '« Rapport mensuel » : le PDF du mois (chiffres clés, meilleurs clients, techniciens, factures à relancer, échéances).',
      '« Agent Direction » (en haut du menu) : appuie sur le micro et pose ta question (« combien on a facturé ce mois-ci ? », « qui nous doit de l’argent ? ») ; la réponse s’affiche et se lit à voix haute. À l’ouverture, un « Point du jour » résume ce qui demande ton attention (retards de paiement, pièces à commander, contrôles dépassés, OR et rendez-vous du jour) : il est fait une fois par jour, le bouton d’actualisation le refait avec les données du moment. « Mails reçus » (sous « Agent Direction » dans le menu, ou depuis l’agent) liste les copies des mails des boîtes de l’atelier, triées par l’agent (urgents d’abord, demandes de devis, réponses attendues) : ouvre un mail pour le lire, coche-le quand il est traité. Pour les mails qui attendent une réponse, l’agent prépare la réponse : le point du jour résume le mail, lit la réponse et te demande « Je l’envoie ? » (Envoyer, Modifier ou Plus tard, au clic ou à la voix). Un envoi décidé s’annule pendant 5 secondes. Il lit les chiffres et ne modifie rien de lui-même : il prépare, tu valides. Il peut préparer un rendez-vous (pris, déplacé ou annulé), un travail à ajouter sur un OR, un technicien à assigner, la date prévue d’un OR, un OR terminé à passer « Facture à faire », un brouillon de facture (jamais émis par lui) ou la nouvelle date d’un contrôle technique ou hayon : tout s’affiche sous sa réponse ; « Valider » (ou « vas-y » à la voix) le fait au bout de 5 secondes, « Annuler » l’arrête. Une liste demandée (« sors-moi les véhicules dont le contrôle technique arrive à échéance ») s’affiche en tableau, à copier dans un tableur ou à télécharger (CSV). Il écrit aussi des mails : un seul (« relance Martin pour ses factures en retard ») ou un par client (« écris à chaque entreprise concernée ») ; les mails s’affichent un par un, tu modifies le destinataire, l’objet ou le texte, puis « Envoyer » ou « Ne pas envoyer ». Rien ne part avant « Envoyer » ; un mail préparé reste valable 24 heures, et une relance est notée sur chaque facture. À activer dans « Réglages », onglet « Atelier », où un mémo permet aussi de lui expliquer vos habitudes (rôles, surnoms de clients).',
      'La cloche regroupe les alertes : devis acceptés, factures en retard, OR en retard, congés à valider, stock bas, entretiens à planifier.',
    ],
  },
];

export interface HelpQuestion {
  question: string;
  answer: string;
}

export const FAQ: HelpQuestion[] = [
  {
    question: 'Un forfait n’est pas détecté automatiquement',
    answer:
      'Dans « Stock », onglet « Forfaits », vérifie que la catégorie correspond au type du véhicule de l’OR et que tous les mots d’un mot-clé figurent dans le texte du technicien.',
  },
  {
    question: 'Le mail ne part pas de l’adresse de l’atelier',
    answer:
      'L’appli prépare le message, c’est ta messagerie qui l’envoie. Sur le poste du bureau, mets l’adresse de l’atelier comme compte par défaut (Outlook ou Mail), ou utilise « Ouvrir dans Gmail » : il s’ouvre sur le compte de l’atelier.',
  },
  {
    question: 'Quelles notifications je reçois sur mon téléphone ?',
    answer:
      'Bureau : chaque alerte de la cloche qui demande une action (devis accepté ou refusé, devis sans réponse en fin de mois, travaux avant devis, OR en retard, factures en retard, stock bas, demande de rendez-vous, borne bloquée…). La nuit (21 h - 7 h), elles attendent 7 h, sauf la réponse d’un client à un devis. Direction : toutes ses alertes de la cloche (signature reçue, location reconduite, badge pendant une absence, sous-traitance en retard compris), les demandes de congé, et l’atelier en direct : OR commencé, mis en pause, repris, travaux terminés. Jamais pour sa propre action. Technicien : OR confié, modifié ou rouvert, et réponse à sa demande de congé.',
  },
  {
    question: 'Je ne reçois pas les notifications',
    answer:
      'Sur chaque téléphone, touche « Activer les notifications » dans le bandeau en haut de l’écran et accepte. Sur iPhone, installe d’abord l’appli (Partager, puis « Sur l’écran d’accueil ») et ouvre-la depuis l’icône. Si tu les as refusées, réautorise-les dans les réglages du navigateur. Se déconnecter coupe les notifications sur cet appareil.',
  },
  {
    question: 'Plus de réseau à l’atelier',
    answer:
      'Un bandeau orange « Hors connexion » s’affiche en bas. Les écrans déjà ouverts restent consultables et tes modifications (lignes, fiche de contrôle, kilométrage…) partent toutes seules au retour du réseau : garde l’appli ouverte. Le badgeage et le pointage à la borne ont besoin du réseau (l’heure est celle du serveur).',
  },
  {
    question: 'L’appli n’affiche pas la dernière version',
    answer: 'Ferme l’appli et rouvre-la. Si besoin, recharge la page une deuxième fois.',
  },
  {
    question: 'Je me suis trompé sur une facture',
    answer:
      'Une facture émise ne peut pas être modifiée. Ouvre-la, « Générer un avoir », puis refais une facture si nécessaire.',
  },
  {
    question: 'Un technicien a terminé trop tôt',
    answer: 'Sur l’OR, la direction peut « Débloquer pour le technicien » : il le retrouve dans sa liste.',
  },
];
