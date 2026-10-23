import { describe, expect, it } from 'vitest';
import { oralText } from './oral';
import { speakableText } from './speech';

describe('texte écrit pour l’oreille', () => {
  it('montants en euros, centimes dits après', () => {
    expect(oralText('Reste dû : 1 250,00 € TTC')).toBe('Reste dû : 1 250 euros T T C');
    expect(oralText('Pneu à 12,50 €, forfait 320 € HT')).toBe(
      'Pneu à 12 euros 50, forfait 320 euros hors taxes',
    );
    expect(oralText('Total 1 €')).toBe('Total 1 euro');
  });

  it('numéros de documents sans les zéros', () => {
    expect(oralText('Le devis DV07701 de l’OR00192, facture F11887, avoir AV00012')).toBe(
      'Le devis 7701 de l’O R 192, facture 11887, avoir 12',
    );
  });

  it('dates, heures et pourcentages', () => {
    expect(oralText('Rendez-vous le 18/10/2026 à 08h30')).toBe(
      'Rendez-vous le 18 octobre 2026 à 8 heures 30',
    );
    expect(oralText('Échéance au 01/11, retour à 14:00')).toBe(
      'Échéance au 1er novembre, retour à 14 heures',
    );
    expect(oralText('Remise de 10 %')).toBe('Remise de 10 pour cent');
    expect(oralText('Pièce 31/80')).toBe('Pièce 31/80');
  });

  it('plaques épelées, sigles de l’atelier', () => {
    expect(oralText('Le PL GH-512-RT a 184 320 km, CT dans 12 jours')).toBe(
      'Le poids lourd G H, 512, R T a 184 320 kilomètres, contrôle technique dans 12 jours',
    );
    expect(oralText('Un VUL, N° 4')).toBe('Un utilitaire, numéro 4');
  });

  it('lecture : mise en forme retirée puis texte réécrit', () => {
    expect(speakableText('**Facture F11887** : 320,00 € TTC\n- échue le 27/10')).toBe(
      'Facture 11887 : 320 euros T T C. échue le 27 octobre',
    );
  });
});
