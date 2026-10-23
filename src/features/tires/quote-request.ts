import type { TireProfile } from './domain';

export interface RequestLine {
  size: string;
  profile: TireProfile;
  quantity: number;
}

export interface Company {
  name: string;
  address: string;
}

const PROFILE_TEXT: Record<TireProfile, string> = {
  avant: 'profil avant',
  arriere: 'profil arrière',
  remorque: 'profil remorque',
  multi: 'multi-positions',
  toutes: '',
};

const tires = (count: number) => `${count} pneu${count > 1 ? 's' : ''}`;

/**
 * Mail de demande de chiffrage : tailles et quantités, aucune marque (il peut partir à n'importe
 * quel fournisseur, ou à plusieurs pour comparer).
 */
export function quoteRequestMessage(lines: RequestLine[], company: Company) {
  const items = lines
    .filter((line) => line.quantity > 0)
    .map(
      (line) =>
        `• ${[line.size, PROFILE_TEXT[line.profile]].filter(Boolean).join(', ')} : ${tires(line.quantity)}`,
    );
  const signature = ['Cordialement,', company.name, company.address].filter(Boolean).join('\n');
  return {
    subject: ['Demande de chiffrage pneumatiques', company.name].filter(Boolean).join(' · '),
    body: [
      'Bonjour,',
      'Pourriez-vous nous faire parvenir votre meilleur prix et votre délai pour les pneumatiques suivants :',
      items.join('\n'),
      'Toutes marques possibles, merci de préciser la marque proposée et l’indice de charge.',
      signature,
    ].join('\n\n'),
  };
}

/** Lien de la messagerie de l'ordinateur : fournisseurs en copie cachée (aucun ne voit les autres). */
export function quoteRequestMailto(recipients: string[], subject: string, body: string) {
  const params = new URLSearchParams({ bcc: recipients.join(','), subject, body });
  return `mailto:?${params.toString().replace(/\+/g, '%20')}`;
}
