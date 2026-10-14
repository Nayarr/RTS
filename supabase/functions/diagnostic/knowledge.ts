// Fiche de diagnostic de l'atelier : synthèse des méthodes de diagnostic poids lourd, utilitaire et
// remorque, rédigée pour l'aide au diagnostic (connaissances générales du métier, sans copie de
// documentation constructeur). Envoyée à chaque demande et mise en cache par l'API. Les valeurs
// sont des ordres de grandeur : la valeur exacte se vérifie toujours dans la documentation du
// constructeur (ou les PDF ajoutés à la Documentation technique, facultatifs).

const SECTIONS: [string, string[]][] = [
  [
    'Méthode générale',
    [
      'Faire préciser le symptôme : quand (à froid, à chaud, au ralenti, en charge, en côte), depuis quand, permanent ou intermittent, voyants et messages au tableau de bord.',
      'Lire les codes défaut avec la valise (moteur, boîte, EBS, ECAS, carrosserie) et noter actifs et passifs avant tout effacement ; un code passif répété oriente vers un faux contact.',
      'Regarder l’historique : pièce remplacée récemment, panne qui revient, entretien en retard, kilométrage.',
      'Aller du plus simple et du plus probable au plus coûteux : alimentation, masses, connecteurs, fuites, niveaux, avant de remplacer un calculateur ou un capteur.',
      'Vérifier une hypothèse par une mesure (tension, pression, résistance, débit) avant de commander une pièce.',
    ],
  ],
  [
    'Sécurité',
    [
      'Circuit d’air : vidanger les réservoirs avant d’ouvrir un circuit ; un cylindre de frein à ressort (Tristop) se cage avant démontage, jamais d’ouverture sans outil de mise en cage.',
      'Véhicule calé, frein de parc serré, coupe-batterie ouvert pour toute intervention électrique lourde ; attention aux airbags et aux condensateurs.',
      'Circuit de carburant haute pression (common rail) : attendre la chute de pression moteur arrêté, ne jamais desserrer un raccord moteur tournant.',
      'Hayon élévateur : plateau au sol ou calé avant toute intervention hydraulique, circuit dépressurisé.',
      'Véhicule électrique ou hybride : consignation haute tension par une personne habilitée.',
    ],
  ],
  [
    'Freinage pneumatique et EBS',
    [
      'Pression du circuit : la pression de régulation se situe en général entre 8 et 12,5 bar selon le véhicule ; un temps de remplissage anormalement long oriente vers le compresseur (clapets, segmentation), le régulateur, le dessiccateur ou une fuite.',
      'Fuites : contrôler la chute de pression moteur arrêté, freins desserrés puis serrés ; chercher à l’eau savonneuse aux raccords, valves et membranes.',
      'Eau ou huile dans les réservoirs : cartouche de dessiccateur saturée ou compresseur qui passe de l’huile.',
      'Frein qui tire ou chauffe : étrier grippé (coulisseaux), rattrapage d’usure bloqué, disque voilé, cylindre de frein qui ne se vide pas, pression inégale (valve relais).',
      'EBS : défaut capteur de vitesse de roue (entrefer, roue dentée, connecteur, résistance du capteur), modulateur, alimentation du calculateur ; sur une remorque, vérifier la prise ISO 7638 et la tension sous charge.',
      'Usure plaquettes et disques : comparer à la cote mini du constructeur ; fissures radiales au-delà des limites tolérées, bord de disque, épaisseur.',
    ],
  ],
  [
    'Moteur diesel',
    [
      'Démarrage difficile : tension de batterie au démarreur, désamorçage ou prise d’air au circuit gazole, préfiltre colmaté, gazole figé par le froid (paraffine), compression, aide au démarrage froid.',
      'Perte de puissance : filtre à gazole ou à air colmaté, fuite d’air de suralimentation (durites, échangeur), turbo (jeu, fuite d’huile, actionneur), injecteurs, capteurs de pression de rail ou de suralimentation, post-traitement colmaté (mode dégradé).',
      'Fumée noire : manque d’air ou excès de gazole (injecteur qui fuit, suralimentation faible) ; fumée blanche : liquide de refroidissement brûlé (joint de culasse) ou gazole mal brûlé à froid ; fumée bleue : huile brûlée (turbo, segmentation, guides de soupape).',
      'Common rail : comparer pression de rail demandée et mesurée, mesurer le débit de retour des injecteurs, vérifier la pompe haute pression et le régulateur de pression.',
      'Bruits : cliquetis d’injection, claquement de soupape (jeu), sifflement de turbo ou de fuite d’air, bruit de distribution.',
    ],
  ],
  [
    'Lubrification et refroidissement',
    [
      'Voyant de pression d’huile : contrôler d’abord le niveau et la qualité de l’huile, puis le capteur et son faisceau, puis la pression réelle au manomètre (à chaud, ralenti et régime) ; une pression basse à chaud oriente vers l’usure des coussinets, la pompe ou le clapet de décharge.',
      'Consommation d’huile : fuites extérieures, turbo, reniflard, segmentation ; huile dans le liquide de refroidissement : échangeur d’huile ou joint de culasse.',
      'Surchauffe : niveau, radiateur encrassé (extérieur et intérieur), viscocoupleur ou ventilateur, thermostat, pompe à eau, bouchon de vase d’expansion, joint de culasse (bulles, pression dans le circuit).',
      'Perte de liquide sans fuite visible : joint de culasse, échangeur, compresseur d’air refroidi par eau, chauffage.',
    ],
  ],
  [
    'Post-traitement (FAP, SCR et AdBlue, EGR)',
    [
      'Filtre à particules : contrôler la pression différentielle, les températures avant et après, les régénérations réussies ; un colmatage répété oriente vers un injecteur, un turbo qui passe de l’huile, une huile non conforme ou un usage en trajets courts.',
      'SCR et AdBlue : qualité et niveau d’AdBlue (cristallisation, eau, gel), pompe et injecteur d’AdBlue, chauffage du réservoir et des tuyaux, capteurs de NOx ; un défaut prolongé entraîne une limitation du couple.',
      'EGR : vanne bloquée ou encrassée, refroidisseur EGR qui fuit (perte de liquide, fumée blanche), capteurs de débit d’air.',
      'Un post-traitement en défaut peut venir d’un problème moteur en amont : le traiter avant de remplacer un catalyseur ou un filtre.',
    ],
  ],
  [
    'Électricité et électronique',
    [
      'Batteries 24 V (deux batteries 12 V en série) : au repos, environ 25,2 à 25,6 V pour des batteries chargées ; en charge moteur tournant, environ 27,5 à 28,5 V ; une tension de charge hors plage oriente vers l’alternateur ou son régulateur.',
      'Tester chaque batterie séparément et sous charge ; une batterie faible déséquilibre l’ensemble et provoque des défauts fantômes sur les calculateurs.',
      'Masses et connecteurs : chute de tension sur les masses (quelques dixièmes de volt au plus sous courant), oxydation, broches écartées, faisceaux frottés ; beaucoup de défauts intermittents viennent de là.',
      'Réseau CAN : plusieurs calculateurs en défaut de communication en même temps orientent vers le réseau (résistances de terminaison, environ 60 ohms mesurés entre CAN haut et CAN bas, contact coupé) ou une alimentation commune.',
      'Consommation au repos : mesurer le courant de fuite contact coupé, calculateurs endormis, puis retirer les fusibles un à un.',
    ],
  ],
  [
    'Transmission',
    [
      'Boîte robotisée : défaut de passage ou patinage, faire d’abord l’apprentissage ou le calibrage de l’embrayage et de la boîte à la valise, contrôler la pression d’air d’alimentation et les fuites de l’actionneur.',
      'Embrayage : patinage (usure, huile sur le disque), broutement, course de la commande ; ralentisseur hydraulique : niveau et température d’huile, échangeur.',
      'Bruits de pont ou de boîte : niveau et état de l’huile (limaille), jeux de roulements, cardans et croisillons.',
    ],
  ],
  [
    'Suspension, direction, essieux et pneus',
    [
      'Suspension pneumatique : coussins percés, valves de nivellement, capteurs de hauteur de l’ECAS (calibrage après remplacement), fuites.',
      'Direction : jeu aux rotules, barre d’accouplement, barre de direction, boîtier ; direction dure : niveau et pompe d’assistance, filtre.',
      'Usure anormale des pneus : bords usés (pression ou parallélisme), usure en dents de scie (géométrie), méplats (blocage de roue, frein qui colle) ; contrôler pressions, parallélisme et amortisseurs.',
      'Moyeux : jeu ou chauffe des roulements, joint de moyeu qui fuit, serrage des écrous de roue après remontage.',
    ],
  ],
  [
    'Remorques et semi-remorques',
    [
      'Feux : tension à la prise, masse de la remorque, prise et câble spirale, faisceau de la remorque (souvent corrodé).',
      'Freins : têtes d’accouplement (filtres, joints), valve de remorque, EBS remorque alimenté par la prise ISO 7638, frein de parc et de manœuvre.',
      'Béquilles, sellette, pivot d’attelage : jeu et usure à comparer aux cotes du constructeur.',
    ],
  ],
  [
    'Hayon élévateur',
    [
      'Ne monte pas : batterie et câble d’alimentation (forte intensité), fusible, relais ou contacteur de moteur, niveau d’huile, électrovannes, boîtier de commande.',
      'Descend seul ou ne tient pas en charge : fuite interne d’un vérin, clapet ou électrovanne qui fuit, flexibles.',
      'Inclinaison défaillante : vérins d’inclinaison, électrovannes, réglage des fins de course.',
      'Après réparation : contrôle de la charge maximale, des sécurités et de l’étiquette de contrôle du hayon.',
    ],
  ],
  [
    'Climatisation et chauffage',
    [
      'Pas de froid : charge de gaz, embrayage du compresseur, pressostat, condenseur encrassé, fuite (traceur).',
      'Chauffage faible : niveau de liquide, robinet de chauffage, radiateur de chauffage, air dans le circuit ; chauffage additionnel : alimentation gazole et bougie.',
    ],
  ],
];

/** Fiche complète, en texte (sans tiret cadratin). */
export const DIAGNOSTIC_SHEET = [
  'FICHE DE DIAGNOSTIC DE L’ATELIER (connaissances générales ; valeurs indicatives, la valeur exacte se vérifie chez le constructeur)',
  ...SECTIONS.map(([title, lines]) => `\n${title} :\n${lines.map((line) => `- ${line}`).join('\n')}`),
].join('\n');

export const SHEET_TITLES = SECTIONS.map(([title]) => title);
