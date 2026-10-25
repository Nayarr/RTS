// Conditions générales de location (contrat type de l'atelier), complétées par les conditions du
// contrat : durée et reconduction, loyer, dépôt de garantie. Le prêt de courtoisie n'en a pas.
import { formatEuro } from '@/lib/numbers';
import { RATE_PERIODS } from './rental-domain';

export interface TermsArticle {
  title: string;
  /** Paragraphes ; une ligne qui commence par « • » est un point de liste. */
  paragraphs: string[];
}

export interface RentalTermsInput {
  rate_period: string;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  deposit: number;
  /** Absent du contrat lu en ligne : reconduction tacite (réglage par défaut des contrats). */
  tacit_renewal?: boolean;
}

/** « un jour », « une semaine », « un mois », « un an ». */
const ONE: Record<string, string> = {
  day: 'un (1) jour',
  weekend: 'un (1) jour',
  week: 'une (1) semaine',
  month: 'un (1) mois',
  year: 'un (1) an',
};

export function rentalTerms(input: RentalTermsInput): TermsArticle[] {
  const period = RATE_PERIODS.find((entry) => entry.value === input.rate_period) ?? RATE_PERIODS[0];
  const price = input.unit_price * (1 - input.discount_percent / 100);
  const monthly = input.rate_period === 'month';
  return [
    {
      title: 'Durée de la location',
      paragraphs: [
        'La location est consentie de la date et de l’heure de départ à la date et à l’heure de retour prévues au contrat.',
        ...(input.tacit_renewal === false
          ? []
          : [
              `Elle est renouvelée par tacite reconduction, pour des périodes successives de ${
                ONE[input.rate_period] ?? ONE.day
              }, sauf dénonciation par l’une des parties notifiée à l’autre par écrit, moyennant un préavis raisonnable.`,
            ]),
      ],
    },
    {
      title: 'Loyer',
      paragraphs: [
        `Le loyer est de ${formatEuro(price)} HT par ${period.unit}, TVA applicable au taux en vigueur (${input.vat_rate} %).`,
        monthly
          ? 'Le loyer est payable mensuellement, au 5 de chaque mois, par virement bancaire sur le compte désigné par le Bailleur.'
          : 'Le loyer est payable à réception de la facture, par virement bancaire sur le compte désigné par le Bailleur.',
        'Tout retard de paiement entraînera l’application d’intérêts de retard calculés au taux légal majoré de 10 points.',
        ...(monthly
          ? [
              'Tout mois commencé est intégralement dû, sans proratisation, quelle que soit la date de restitution du véhicule en cours de mois.',
            ]
          : []),
      ],
    },
    {
      title: 'Dépôt de garantie',
      paragraphs:
        input.deposit > 0
          ? [
              `Le Locataire verse à la signature du contrat un dépôt de garantie de ${formatEuro(input.deposit)}.`,
              'Ce dépôt garantit l’exécution de l’ensemble des obligations du Locataire. Il est restitué à l’issue du contrat, après restitution du véhicule et règlement de toutes les sommes dues.',
            ]
          : ['Aucun dépôt de garantie n’est demandé pour ce contrat.'],
    },
    {
      title: 'Utilisation du véhicule',
      paragraphs: [
        'Le Locataire s’engage à :',
        '• utiliser le véhicule conformément à sa destination professionnelle ;',
        '• respecter les dispositions légales et réglementaires applicables au transport routier ;',
        '• ne pas sous-louer ou prêter le véhicule sans autorisation écrite préalable du Bailleur ;',
        '• veiller au maintien du véhicule en bon état d’utilisation.',
      ],
    },
    {
      title: 'Entretien et réparations',
      paragraphs: [
        'Le Locataire est responsable de l’entretien courant du véhicule pendant toute la durée de la location. Les réparations résultant :',
        '• d’une usure normale demeurent à la charge du Bailleur ;',
        '• d’une mauvaise utilisation, d’une négligence ou d’un accident imputable au Locataire demeurent à la charge du Locataire.',
        'Toute intervention importante devra être préalablement autorisée par le Bailleur.',
        'Le contrôle et la mise à niveau des fluides (huile moteur, liquide de refroidissement, liquide de frein, lave-glace, etc.) sont à la charge exclusive du Locataire pendant toute la durée de la location.',
      ],
    },
    {
      title: 'Assurance',
      paragraphs: [
        'Le Locataire s’engage à maintenir pendant toute la durée du contrat une assurance couvrant :',
        '• la responsabilité civile ;',
        '• les dommages causés au véhicule ;',
        '• le vol ;',
        '• l’incendie.',
        'Le Locataire remettra au Bailleur une attestation d’assurance valide avant la prise de possession du véhicule et à chaque renouvellement.',
      ],
    },
    {
      title: 'Responsabilité',
      paragraphs: [
        'Le Locataire assume la garde juridique du véhicule pendant toute la durée de la location. Il est seul responsable :',
        '• des infractions au Code de la route ;',
        '• des amendes ;',
        '• des frais de stationnement ;',
        '• des dommages causés aux tiers du fait de l’utilisation du véhicule.',
      ],
    },
    {
      title: 'Restitution',
      paragraphs: [
        'À l’expiration du contrat, le Locataire devra restituer le véhicule :',
        '• au siège du Bailleur ou en tout autre lieu convenu entre les parties ;',
        '• dans un état conforme à celui constaté lors de la remise, sous réserve de l’usure normale.',
        'Un état contradictoire sera établi lors de la restitution. Les frais de remise en état résultant d’une dégradation anormale seront facturés au Locataire.',
      ],
    },
    {
      title: 'Résiliation',
      paragraphs: [
        'Le contrat pourra être résilié de plein droit par le Bailleur en cas :',
        '• de non-paiement du loyer ;',
        '• de défaut d’assurance ;',
        '• de non-respect des obligations contractuelles par le Locataire.',
        'La résiliation prend effet huit (8) jours après mise en demeure restée sans effet.',
      ],
    },
    {
      title: 'Droit applicable et juridiction compétente',
      paragraphs: [
        'Le contrat est soumis au droit français. Tout litige relatif à son interprétation ou à son exécution sera soumis à la compétence des tribunaux du ressort du siège social du Bailleur, sauf disposition légale contraire.',
      ],
    },
  ];
}
