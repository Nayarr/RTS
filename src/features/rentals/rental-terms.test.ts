import { describe, expect, it } from 'vitest';
import { rentalClause, rentalTerms } from './rental-terms';

const monthly = { rate_period: 'month', unit_price: 900, discount_percent: 0, vat_rate: 20, deposit: 0 };

describe('conditions générales de location', () => {
  it('contrat au mois : reconduction d’un mois, loyer payable au 5, mois commencé dû, sans dépôt', () => {
    const terms = rentalTerms(monthly);
    expect(terms.map((article) => article.title)).toEqual([
      'Objet du contrat',
      'Durée de la location',
      'Loyer',
      'Dépôt de garantie',
      'Utilisation du véhicule',
      'Entretien et réparations',
      'Assurance',
      'Responsabilité',
      'Restitution',
      'Résiliation',
      'Droit applicable et juridiction compétente',
    ]);
    const text = terms.flatMap((article) => article.paragraphs).join('\n');
    expect(text).toContain('pour des périodes successives de un (1) mois');
    expect(text).toMatch(
      /Le loyer est de 900,00\s€ HT par mois, TVA applicable au taux en vigueur \(20 %\)\./,
    );
    expect(text).toContain('mensuellement, au 5 de chaque mois');
    expect(text).toContain('Tout mois commencé est intégralement dû');
    expect(text).toContain('Aucun dépôt de garantie n’est demandé pour ce contrat.');
    expect(text).toContain('huit (8) jours après mise en demeure');
  });

  it('location au jour : remise appliquée, paiement à la facture, dépôt, sans reconduction', () => {
    const text = rentalTerms({
      rate_period: 'day',
      unit_price: 100,
      discount_percent: 10,
      vat_rate: 20,
      deposit: 1500,
      tacit_renewal: false,
    })
      .flatMap((article) => article.paragraphs)
      .join('\n');
    expect(text).toMatch(/Le loyer est de 90,00\s€ HT par jour/);
    expect(text).toContain('payable à réception de la facture');
    expect(text).not.toContain('Tout mois commencé');
    expect(text).not.toContain('tacite reconduction');
    expect(text).toMatch(/dépôt de garantie de 1\s500,00\s€/);
  });

  it('clause du contrat : ne cite que les frais chiffrés et renvoie aux conditions générales', () => {
    const none = {
      extra_km_price: null,
      fuel_price_per_liter: null,
      late_fee_per_hour: null,
      franchise: null,
    };
    const bare = rentalClause(none);
    expect(bare).not.toMatch(/kilomètres supplémentaires|retards|franchise|carburant manquant/);
    expect(bare).toContain('Les dommages constatés au retour sont facturés au locataire.');
    expect(bare).toContain('avoir pris connaissance des conditions générales de location');

    expect(rentalClause({ ...none, fuel_price_per_liter: 2.2 })).toContain(
      'Le carburant manquant est facturé selon les tarifs ci-dessus.',
    );
    const full = rentalClause({
      extra_km_price: 0.3,
      fuel_price_per_liter: 2.2,
      late_fee_per_hour: 25,
      franchise: 1500,
    });
    expect(full).toContain(
      'Les kilomètres supplémentaires, le carburant manquant et les retards sont facturés selon les tarifs ci-dessus.',
    );
    expect(full).toContain('dans la limite de la franchise');
  });
});
