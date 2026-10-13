// Fiches par marque pour l'aide au diagnostic : gammes, moteurs, boîtes, systèmes et retours de terrain
// des poids lourds, utilitaires et remorques européens. Rédigées pour l'atelier (synthèse de
// connaissances générales et de retours publiés, sans copie de documentation constructeur). Les
// « retours de terrain » sont des tendances signalées, à confirmer par les codes défaut et les
// bulletins du constructeur. Seule la fiche de la marque du véhicule est envoyée à chaque demande.

export interface BrandSheet {
  key: string;
  name: string;
  /** Mots reconnus dans la marque ou le modèle du véhicule (sans accent, en minuscules). */
  aliases: string[];
  lines: string[];
}

export const BRAND_SHEETS: BrandSheet[] = [
  {
    key: 'volvo',
    name: 'Volvo Trucks',
    aliases: ['volvo', 'fh16', 'fh', 'fm', 'fmx', 'fe', 'fl'],
    lines: [
      'Gammes : FH et FH16 (route), FM et FMX (distribution lourde, chantier), FE et FL (distribution).',
      'Moteurs : D11, D13 (dont D13 Turbo Compound), D16 sur FH16 ; D8 et D5 sur FE et FL ; Euro 6 en EGR + SCR (AdBlue) avec filtre à particules.',
      'Boîte : I-Shift automatisée (et I-Shift Dual Clutch sur certaines versions), commandée par le calculateur de boîte ; production d’air par module électronique (APM) sur les générations récentes.',
      'Diagnostic : Tech Tool (outil constructeur), lecture des codes moteur (EMS), boîte (TECU), freinage (EBS) et carrosserie.',
      'Retours de terrain : injecteurs et logements d’injecteurs (douilles) du D13 souvent remplacés au moins une fois sur un gros kilométrage ; post-traitement (EGR, régénérations incomplètes, AdBlue) à l’origine de nombreux modes dégradés ; refroidisseur EGR encrassé, plus encore avec du biodiesel.',
      'I-Shift : défauts d’actionneur d’embrayage, de capteurs de position et de logiciel ; faire l’apprentissage de l’embrayage et vérifier la pression d’air avant tout remplacement.',
      'SCR : vanne de dosage, pompe, injecteur d’AdBlue qui fuit ou cristallise, chauffages des tuyaux ; changer le filtre de la pompe d’AdBlue selon le plan d’entretien.',
      'Électricité : défauts de réseau CAN, de connecteurs et de masses fréquents ; surchauffe par ventilateur ou niveau de liquide à surveiller.',
    ],
  },
  {
    key: 'renault',
    name: 'Renault Trucks',
    aliases: ['renault trucks', 'renault', 'range t', 'gamme t', 't high', 'premium', 'magnum', 'kerax'],
    lines: [
      'Gammes : T et T High (route), C (chantier), K (construction lourde), D, D Wide et D Cab 2m (distribution) ; anciennes Premium, Magnum, Kerax, Midlum.',
      'Moteurs : DTI 11 et DTI 13 (famille commune au groupe Volvo), DTI 8 et DTI 5 sur les gammes D ; Euro 6 avec SCR (AdBlue) et filtre à particules. Sur les premières T, le DTI 13 était à injecteurs-pompes électroniques et le DTI 11 en common rail.',
      'Boîte : Optidriver automatisée (même base que l’I-Shift), apprentissage de l’embrayage à la valise après intervention.',
      'Diagnostic : outil constructeur Renault Trucks (même logique que le Tech Tool du groupe).',
      'Retours de terrain (premières gammes T) : voyants, capteurs et pompes d’AdBlue, mises à jour logicielles publiées ; commandes au volant qui cessent de répondre avec des alertes de freinage incohérentes ; défaut du compte-tours numérique provoquant un mode dégradé ; filtres à gazole qui déclenchent des voyants (qualité du gazole ou capteur sensible). Vérifier que les mises à jour ont été faites.',
      'Gamme D : électricité de carrosserie et de hayon souvent en cause ; vérifier l’alimentation et les masses du hayon.',
    ],
  },
  {
    key: 'mercedes',
    name: 'Mercedes-Benz Trucks',
    aliases: ['mercedes', 'mercedes-benz', 'actros', 'arocs', 'antos', 'atego', 'econic', 'axor', 'unimog'],
    lines: [
      'Gammes : Actros (MP4, MP5, Actros L), Arocs (chantier), Antos (distribution lourde), Atego (distribution), Econic (benne et voirie), Unimog ; ancien Axor.',
      'Moteurs : OM470 (10,7 l), OM471 (12,8 l), OM473 (15,6 l), OM936 (7,7 l) et OM934 (5,1 l) ; common rail haute pression, Euro 6 en EGR + SCR (AdBlue) avec filtre à particules.',
      'Boîte : PowerShift automatisée (PowerShift 3 sur les générations récentes), apprentissage de l’embrayage et de la boîte à la valise.',
      'Diagnostic : Xentry (outil constructeur), calculateurs moteur, boîte, freinage et module de post-traitement.',
      'Retours de terrain : système AdBlue sensible (chauffage du réservoir grillé, injecteur et tuyaux bouchés, cristallisation sur trajets courts), capteurs de NOx qui lâchent ou donnent de fausses valeurs, compte à rebours avant limitation du couple ; message « qualité AdBlue » après une régénération : contrôler l’AdBlue puis les capteurs de NOx.',
      'PowerShift : défauts d’actionneur d’embrayage et de calibrage, pression d’air insuffisante.',
    ],
  },
  {
    key: 'scania',
    name: 'Scania',
    aliases: ['scania', 'r450', 'r500', 's500', 'g410', 'p280'],
    lines: [
      'Gammes : R, S (cabine plancher plat), G, P (distribution et chantier), L (urbain) ; nouvelle génération depuis 2016.',
      'Moteurs : DC09 (5 cylindres), DC13 (6 cylindres), DC16 (V8) ; injection XPI (common rail très haute pression) ; Euro 6 en SCR seul ou EGR + SCR selon les versions.',
      'Boîte : Opticruise automatisée (avec ou sans pédale d’embrayage selon les versions), ralentisseur hydraulique fréquent.',
      'Diagnostic : SDP3 (outil constructeur), calculateurs moteur (EMS), boîte (TMS ou GMS), freinage et post-traitement.',
      'Retours de terrain : pompe d’alimentation de gazole (basse pression) signalée comme point faible ; sur les premiers XPI, condensation dans le refroidisseur EGR secondaire pouvant atteindre les cylindres 5 et 6 ; plage d’utilisation étroite du DC13 XPI demandant des changements de rapports fréquents.',
      'XPI : comparer pression de rail demandée et mesurée, vérifier préfiltre et séparateur d’eau avant les injecteurs.',
    ],
  },
  {
    key: 'daf',
    name: 'DAF',
    aliases: ['daf', 'xf', 'xg', 'xd', 'xb', 'cf', 'lf'],
    lines: [
      'Gammes : XF, XG et XG+ (route, nouvelle génération), XD (distribution lourde), XB (distribution), CF et LF (générations précédentes).',
      'Moteurs : PACCAR MX-11 et MX-13 ; PX-7 et PX-5 sur les gammes légères ; Euro 6 en EGR + filtre à particules + SCR (AdBlue).',
      'Boîte : ZF AS-Tronic puis ZF TraXon automatisée ; apprentissage à la valise après intervention.',
      'Diagnostic : DAVIE (outil constructeur).',
      'Retours de terrain MX-13 : alimentation en gazole souvent en cause (démarrage difficile, ralenti instable, cognement en charge, perte de puissance, défaut de pression de rail basse) ; dépôts dans la valve de commande des injecteurs ; contrôler qualité du gazole, pression de rail en charge et pompe haute pression avant de remplacer les injecteurs.',
      'Codes EGR (pression différentielle, température) souvent dus aux capteurs ou au câblage : vérifier le circuit avant de remplacer la vanne.',
    ],
  },
  {
    key: 'man',
    name: 'MAN Truck & Bus',
    aliases: ['man', 'tgx', 'tgs', 'tgm', 'tgl', 'tge'],
    lines: [
      'Gammes : TGX (route), TGS (chantier et distribution lourde), TGM et TGL (distribution), TGE (utilitaire, base Volkswagen Crafter).',
      'Moteurs : D15, D26 (D2676) et D38 (D3876) ; D08 (D0836) sur TGM et TGL ; Euro 6 en EGR + filtre à particules + SCR (AdBlue).',
      'Boîte : TipMatic automatisée (base ZF), puis ZF TraXon sur les générations récentes.',
      'Diagnostic : MAN-cats (outil constructeur), calculateurs moteur (EDC), post-traitement, boîte et freinage.',
      'Rappel connu : D2676 Euro 6c construits de 11/2016 à 08/2019 (types D2676LF51 à 53, D2676LOH35 à 37), coussinets sans plomb sensibles à une huile usée ou polluée ; contrôle demandé en atelier MAN, vérifier que la campagne a été faite et respecter les vidanges.',
      'D26 Euro 5 : défauts connus de refroidisseur EGR et d’échangeur de suralimentation haute pression.',
      'Retours de terrain : défauts AdBlue et SCR dus au câblage et aux connecteurs (pompe, réservoir, capteur de NOx, réseau CAN du post-traitement), cristaux d’AdBlue qui corrodent les broches (remplacer le connecteur plutôt que le nettoyer) ; une vanne EGR en court-circuit peut perturber le réseau et même la boîte.',
    ],
  },
  {
    key: 'iveco',
    name: 'Iveco',
    aliases: ['iveco', 's-way', 'sway', 'stralis', 'x-way', 'trakker', 'eurocargo', 'tector'],
    lines: [
      'Gammes : S-Way (route, remplace le Stralis), X-Way (mixte chantier), Trakker (chantier), Eurocargo (distribution), Daily (utilitaire, voir fiche utilitaires).',
      'Moteurs FPT : Cursor 9, 11 et 13 ; Tector (NEF) sur l’Eurocargo ; Euro 6 en HI-SCR, c’est-à-dire SCR et filtre à particules sans EGR : la qualité de l’AdBlue et le dosage comptent d’autant plus.',
      'Boîte : Hi-Tronix automatisée (base ZF) sur S-Way et Stralis récents.',
      'Diagnostic : E.A.SY (outil constructeur).',
      'Retours de terrain : colmatage du filtre à particules signalé sur Cursor 13 ; injecteurs common rail qui s’usent ou fuient ; HI-SCR : capteurs de NOx, module de dosage et chauffage d’AdBlue.',
    ],
  },
  {
    key: 'vul',
    name: 'Utilitaires légers',
    aliases: [
      'master',
      'trafic',
      'kangoo',
      'daily',
      'sprinter',
      'vito',
      'transit',
      'custom',
      'ducato',
      'boxer',
      'jumper',
      'jumpy',
      'expert',
      'crafter',
      'transporter',
      'movano',
      'vivaro',
      'nv400',
      'interstar',
      'tge',
    ],
    lines: [
      'Renault Master (2.3 dCi, M9T) : capteur de pression de suralimentation (code P0234, mode dégradé au-delà de 2 500 tr/min signalé sur 2020-2021) ; filtre à particules et module SCR qui colmatent en usage urbain ; débitmètre d’air ; embrayage sollicité en charge ; surveiller la lubrification du bas moteur (coussinets) et raccourcir les vidanges en usage intensif. Mêmes bases sur Opel Movano et Nissan NV400.',
      'Renault Trafic, Opel Vivaro, Fiat Talento (1.6 et 2.0 dCi) : filtre à particules et vanne EGR en trajets courts, turbo.',
      'Iveco Daily (2.3 et 3.0) : châssis séparé proche du poids lourd ; boîte automatique Hi-Matic (8 rapports, base ZF) : niveau et qualité d’huile ; post-traitement selon millésime.',
      'Mercedes Sprinter et Vito (2.1 et 2.0 CDI) : AdBlue (chauffage du réservoir, capteurs de NOx), injecteurs, filtre à particules.',
      'Ford Transit et Transit Custom (2.0 EcoBlue) : boîte automatique signalée comme point de vigilance à l’occasion ; post-traitement AdBlue ; suivre les mises à jour et les campagnes Ford.',
      'Fiat Ducato, Peugeot Boxer, Citroën Jumper (2.2 et 2.3 Multijet) : filtre à particules, vanne EGR, embrayage et volant moteur en charge.',
      'Volkswagen Crafter et MAN TGE (2.0 TDI) : post-traitement AdBlue, filtre à particules, boîte automatique selon version.',
      'Code P20EE (efficacité SCR insuffisante) : injecteur d’AdBlue bouché, AdBlue de mauvaise qualité, capteurs de NOx, avant le catalyseur lui-même.',
      'Utilitaires : contrôle antipollution un an avant le contrôle technique ; trajets courts répétés = régénérations interrompues, à expliquer au client.',
    ],
  },
  {
    key: 'trailer',
    name: 'Remorques et semi-remorques',
    aliases: [
      'remorque',
      'semi',
      'schmitz',
      'krone',
      'kogel',
      'kögel',
      'fruehauf',
      'chereau',
      'lamberet',
      'benalu',
      'trouillet',
      'samro',
      'general trailers',
    ],
    lines: [
      'Constructeurs fréquents : Schmitz Cargobull, Krone, Kögel, Fruehauf, Chereau et Lamberet (frigorifique), Benalu (benne), Trouillet, Samro ; essieux BPW, SAF et autres.',
      'Freinage : EBS remorque (WABCO, Knorr-Bremse, Haldex) alimenté par la prise ISO 7638 ; un défaut est souvent attribué à tort au calculateur : lire les défauts actifs et mémorisés (valise, module d’information de la remorque), comparer les vitesses des capteurs de roue des deux côtés, vérifier capteur, câblage et modulateur avant le calculateur.',
      'Défaut d’accélération latérale : peut venir des vitesses de roue ou d’une mauvaise programmation (voie, orientation du calculateur), vérifier la configuration avant de remplacer.',
      'Éclairage : prise 15 broches ou deux prises 7 broches, masse, câble spirale, faisceau corrodé ; groupe frigorifique : alimentation propre et masse dédiée.',
      'Essieux : jeu et chauffe des moyeux, réglage du frein, usure des disques ou tambours ; suspension pneumatique : coussins, valve de nivellement, levée d’essieu.',
    ],
  },
  {
    key: 'tailgate',
    name: 'Hayons élévateurs',
    aliases: [
      'hayon',
      'dhollandia',
      'bar cargolift',
      'bär',
      'mbb',
      'palfinger',
      'zepro',
      'zeplin',
      'anteo',
      'sorensen',
    ],
    lines: [
      'Marques fréquentes : Dhollandia, Bär Cargolift, MBB Palfinger, Zepro et Zeplin, Anteo, Sörensen.',
      'Le circuit est hydraulique (groupe moteur-pompe 24 V ou 12 V, électrovannes, vérins de levée et d’inclinaison) et électrique (boîtier de commande, contacteurs de sécurité, interrupteur en cabine).',
      'Pannes typiques : chute de tension à l’alimentation (câble, fusible de forte intensité, batteries faibles), contacteur du moteur, niveau d’huile, électrovanne collée, fuite interne d’un vérin, capteurs d’inclinaison ou de fin de course.',
      'Contrôle périodique obligatoire du hayon : étiquette à jour, charge maximale, sécurités.',
    ],
  },
];

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Fiches utiles pour le véhicule : sa marque, la fiche utilitaire ou remorque selon le type, et le hayon si besoin. */
export function sheetsFor(
  vehicle: { marque?: string | null; modele?: string | null; type?: string | null } | null | undefined,
  question = '',
): BrandSheet[] {
  const text = ` ${normalize(`${vehicle?.marque ?? ''} ${vehicle?.modele ?? ''}`)} `;
  const words = (alias: string) =>
    new RegExp(`[^a-z0-9]${normalize(alias).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}[^a-z0-9]`);
  const chosen = new Set<BrandSheet>();
  const vul = BRAND_SHEETS.find((sheet) => sheet.key === 'vul')!;
  const trailer = BRAND_SHEETS.find((sheet) => sheet.key === 'trailer')!;
  const tailgate = BRAND_SHEETS.find((sheet) => sheet.key === 'tailgate')!;
  const isVul = vehicle?.type === 'vul' || vul.aliases.some((alias) => words(alias).test(text));
  // Marque du poids lourd (un utilitaire Renault ou Mercedes n'a pas la fiche poids lourd de la marque)
  const byBrand = isVul ? undefined : BRAND_SHEETS.find(
    (sheet) =>
      !['vul', 'trailer', 'tailgate'].includes(sheet.key) &&
      sheet.aliases.some((alias) => words(alias).test(text)),
  );
  if (byBrand) chosen.add(byBrand);
  if (isVul) chosen.add(vul);
  if (vehicle?.type === 'remorque' || trailer.aliases.some((alias) => words(alias).test(text))) {
    chosen.add(trailer);
  }
  if (/hayon|plateau|elevateur/.test(normalize(question))) chosen.add(tailgate);
  return [...chosen];
}

/** Texte des fiches choisies, ou une note quand la marque n'est pas connue. */
export function brandText(sheets: BrandSheet[]): string {
  if (sheets.length === 0) {
    return `Fiche marque : marque du véhicule non reconnue (fiches disponibles : ${
      BRAND_SHEETS.map((sheet) => sheet.name).join(', ')
    }). Appuie-toi sur la fiche de diagnostic générale.`;
  }
  return sheets
    .map((sheet) =>
      `Fiche marque ${sheet.name} (retours de terrain à confirmer) :\n${
        sheet.lines.map((line) => `- ${line}`).join('\n')
      }`
    )
    .join('\n\n');
}
