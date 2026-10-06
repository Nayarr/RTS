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
      'Renseigne le kilométrage et prends les photos obligatoires : face avant, côté gauche, côté droit, arrière, tableau de bord (pas de tableau de bord pour une remorque).',
      'Appuie sur « Démarrer le badgeage » pour lancer le chrono. « Mettre en pause » l’arrête ; tu le relances avec le même bouton.',
    ],
  },
  {
    title: 'Fiche de contrôle',
    items: [
      'Choisis OK, 50 % ou HS pour chaque élément : la fiche est enregistrée automatiquement. Un élément HS ou à 50 % ajoute tout seul la ligne « Remplacement … » (ou le forfait prévu) dans les travaux à prévoir.',
      'Photographie les étiquettes (contrôle hayon, extincteurs) avec le bouton appareil photo à côté de chacune.',
      'Dans « Échéances du véhicule », renseigne les dates du contrôle technique et du contrôle hayon lues sur le camion.',
    ],
  },
  {
    title: 'Travaux effectués / à prévoir',
    items: [
      '« Travaux effectués » : ce que tu as réellement fait. C’est ce qui sera facturé.',
      '« Pièces / réparations à prévoir (devis) » : ce qu’il faudra faire plus tard. Cela sert au devis.',
      'Indique ton temps estimé pour chaque ligne.',
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
      'Pour un congé, utilise « Demander un congé » sur ton accueil. La direction valide ou refuse.',
    ],
  },
];

export const OFFICE_TOPICS: HelpTopic[] = [
  {
    title: 'Créer un OR',
    items: [
      'Onglet « Ordres de réparation », puis « Nouvel OR » : immatriculation, client, travaux demandés, type de véhicule, technicien.',
      'Tu peux laisser l’OR sans technicien et l’assigner plus tard, depuis l’OR ou le planning.',
      'Pour un dépannage, choisis le type d’intervention « Dépannage » : déplacement, kilomètres et temps de trajet sont ajoutés à la facture.',
    ],
  },
  {
    title: 'Planning et rendez-vous',
    items: [
      'Vue Semaine ou Jour, une colonne par technicien. Clique dans une case vide pour y assigner un OR.',
      '« Nouveau rendez-vous » pour un véhicule attendu. À son arrivée, ouvre le rendez-vous puis « Créer l’OR ». La veille, envoie le rappel au client (la cloche te le rappelle).',
      '« En direct » montre les véhicules actuellement à l’atelier et le badgeage en cours.',
    ],
  },
  {
    title: 'Devis',
    items: [
      'Sur l’OR, « Préparer le devis » reprend les travaux à prévoir, calcule la main d’œuvre au taux horaire et applique les forfaits. Ajoute pièces, main d’œuvre, texte et remises.',
      '« Envoyer au client (lien à signer) » prépare un lien : le client consulte et signe en ligne, le devis passe seul en « Accepté ».',
      'Devis accepté : « Créer l’OR avec les travaux acceptés » et choisis le technicien.',
      'Travaux déjà faits avant le devis (diagnostic, contrôle) : dès que le devis est accepté, choisis pour chaque ligne « Facturer » (facture séparée émise tout de suite, prix modifiable) ou « Offrir » (visible sur la facture avec 100 % de remise). Un bandeau orange reste sur l’OR tant que ce n’est pas fait.',
    ],
  },
  {
    title: 'Facturer',
    items: [
      'Sur l’OR, « Facturer » prépare un brouillon avec les travaux effectués, les pièces, les consommables, la sous-traitance et le déplacement. Vérifie, ajuste, puis « Émettre la facture ».',
      '« Aperçu pro forma » produit une facture pro forma sans numéro.',
      'Une facture émise ne se modifie plus : pour la corriger, « Générer un avoir », puis une nouvelle facture si besoin.',
      'Sur la facture : « Enregistrer un paiement » (même partiel), « Envoyer au client » pour le lien en ligne, « Relancer » quand elle est en retard.',
      'Plusieurs OR d’un même client ? Fiche client, puis « Facture groupée ».',
    ],
  },
  {
    title: 'Informer le client',
    items: [
      'Sur l’OR, carte « Informer le client » : « Véhicule pris en charge », « Devis disponible », « Véhicule prêt ». Le bouton en vert est celui conseillé ; une coche indique un message déjà envoyé.',
      'L’appli prépare le message ; il part par ta messagerie (e-mail) ou ton téléphone (SMS). Chaque envoi est noté dans l’historique de l’OR.',
      'Fiche client : « Espace client en ligne » envoie au client un lien permanent vers ses véhicules, devis et factures. « Changer le lien » désactive l’ancien.',
      'Renseigne une fois l’e-mail, le téléphone, l’adresse et le SIREN du client : ils sont repris partout.',
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
      '« Stock », onglet « Consommables » : produits en vrac, prix et stock ; une alerte signale un stock sous le seuil.',
      'Borne de pointage et écran atelier (télé) : choisis d’abord le code de sortie dans « Pointages ». Sur la borne, la roue ⚙ et ce code permettent de quitter ou de passer en écran télé.',
      'Sauvegarde : automatique chaque nuit, chiffrée chez l’hébergeur (30 jours de copies de la base, photos et PDF gardés). Rien à faire dans l’appli.',
    ],
  },
  {
    title: 'Pilotage',
    items: [
      'Statistiques, Trésorerie (encaissé, à encaisser, retards, habitudes de paiement), Rentabilité par client et véhicule, Performance des techniciens.',
      '« Rapport mensuel » : le PDF du mois (chiffres clés, meilleurs clients, techniciens, factures à relancer, échéances).',
      '« Agent Direction » (en haut du menu) : appuie sur le micro et pose ta question (« combien on a facturé ce mois-ci ? », « qui nous doit de l’argent ? ») ; la réponse s’affiche et se lit à voix haute. Il lit les chiffres, ne modifie rien. À activer dans « Réglages », onglet « Atelier ».',
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
