import { describe, expect, it } from 'vitest';
import { quoteRequestMailto, quoteRequestMessage } from './quote-request';

const company = { name: 'Rapid Truck Service', address: '19 rue Gaston Monmousseau, 95190 Goussainville' };

describe('demande de chiffrage', () => {
  it('tailles et quantités, profil rappelé, aucune marque', () => {
    const { subject, body } = quoteRequestMessage(
      [
        { size: '315/80 R22.5', profile: 'arriere', quantity: 4 },
        { size: '315/70 R22.5', profile: 'avant', quantity: 1 },
        { size: '235/65 R16C', profile: 'toutes', quantity: 4 },
        { size: '385/65 R22.5', profile: 'remorque', quantity: 0 },
      ],
      company,
    );
    expect(subject).toBe('Demande de chiffrage pneumatiques · Rapid Truck Service');
    expect(body).toBe(
      [
        'Bonjour,',
        'Pourriez-vous nous faire parvenir votre meilleur prix et votre délai pour les pneumatiques suivants :',
        '• 315/80 R22.5, profil arrière : 4 pneus\n• 315/70 R22.5, profil avant : 1 pneu\n• 235/65 R16C : 4 pneus',
        'Toutes marques possibles, merci de préciser la marque proposée et l’indice de charge.',
        'Cordialement,\nRapid Truck Service\n19 rue Gaston Monmousseau, 95190 Goussainville',
      ].join('\n\n'),
    );
  });

  it('messagerie de l’ordinateur : fournisseurs en copie cachée', () => {
    const link = quoteRequestMailto(['a@euromaster.test', 'b@vulco.test'], 'Objet du mail', 'Bonjour');
    expect(link).toBe(
      'mailto:?bcc=a%40euromaster.test%2Cb%40vulco.test&subject=Objet%20du%20mail&body=Bonjour',
    );
  });
});
