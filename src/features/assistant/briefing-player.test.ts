import { describe, expect, it } from 'vitest';
import type { PreparedReply } from './api';
import {
  briefingPhrases,
  briefingSteps,
  localDay,
  nextMail,
  readListened,
  replyLines,
  saveListened,
  skipTarget,
  voiceCommand,
} from './briefing-player';

const reply = (id: string, status: PreparedReply['reply_status'] = 'ready'): PreparedReply => ({
  id,
  mailbox: 'atelier@rapidtruckservice.fr',
  from_name: id === 'r1' ? 'Paul Fontaine' : '',
  from_address: `${id}@exemple.fr`,
  subject: 'Objet',
  received_at: '2026-10-09T05:00:00Z',
  category: 'devis',
  urgency: 'normale',
  summary: 'Résumé du tri.',
  reply_status: status,
  reply_request: id === 'r1' ? 'Son tracteur est en panne.' : null,
  reply_subject: 'Re: Objet',
  reply_body: 'Bonjour,\n\nNous passons à 14 h.\nCordialement,\nRTS',
  reply_basis: null,
  reply_sent_at: null,
  clients: null,
});

describe('lecture du point du jour', () => {
  it('ancien point sans phrases : découpé ligne par ligne', () => {
    expect(briefingPhrases({ phrases: [], text: 'Première.\n\nDeuxième.' })).toEqual([
      { etiquette: '', texte: 'Première.', urgent: false },
      { etiquette: '', texte: 'Deuxième.', urgent: false },
    ]);
  });

  it('étapes : phrases, puis pour chaque réponse à relire le résumé, les lignes et la question', () => {
    const steps = briefingSteps(
      [{ etiquette: 'Atelier', texte: 'Sept OR.', urgent: false }],
      [reply('r1'), reply('r2', 'postponed'), reply('r3')],
    );
    expect(steps.map((step) => step.kind)).toEqual([
      'phrase',
      'mail-intro',
      'mail-line',
      'mail-line',
      'mail-line',
      'mail-line',
      'mail-ask',
      'mail-intro',
      'mail-line',
      'mail-line',
      'mail-line',
      'mail-line',
      'mail-ask',
    ]);
    expect(steps[1]?.text).toBe(
      'Mail de Paul Fontaine. Son tracteur est en panne. Voici la réponse préparée.',
    );
    expect(steps[6]?.text).toBe('Je l’envoie à Paul Fontaine ?');
    // Sans nom ni demande : l'adresse et le résumé du tri
    expect(steps[7]?.text).toBe('Mail de r3@exemple.fr. Résumé du tri. Voici la réponse préparée.');
    expect(replyLines('Bonjour,\n\n  Merci  \n')).toEqual(['Bonjour,', 'Merci']);
  });

  it('passer : phrase suivante pendant le point, mail suivant pendant un mail', () => {
    const steps = briefingSteps(
      [
        { etiquette: '', texte: 'A.', urgent: false },
        { etiquette: '', texte: 'B.', urgent: false },
      ],
      [reply('r1'), reply('r2')],
    );
    expect(skipTarget(steps, 0)).toBe(1);
    expect(skipTarget(steps, 3)).toBe(8);
    expect(skipTarget(steps, 10)).toBe(steps.length);
    expect(nextMail(steps, 7)).toBe(8);
  });

  it('commandes à la voix : envoyer, modifier, plus tard ; une négation veut dire plus tard', () => {
    expect(voiceCommand('Envoie')).toBe('send');
    expect(voiceCommand('oui vas-y')).toBe('send');
    expect(voiceCommand('ok envoyé')).toBe('send');
    expect(voiceCommand('modifie la réponse')).toBe('edit');
    expect(voiceCommand('je veux la corriger')).toBe('edit');
    expect(voiceCommand('plus tard')).toBe('later');
    expect(voiceCommand('non')).toBe('later');
    expect(voiceCommand('ne l’envoie pas')).toBe('later');
    expect(voiceCommand('passe au suivant')).toBe('later');
    expect(voiceCommand('quelle heure est-il')).toBeNull();
  });

  it('point écouté gardé pour la journée sur l’appareil', () => {
    localStorage.clear();
    expect(readListened()).toBeNull();
    const at = new Date(2026, 9, 9, 8, 16);
    saveListened(at);
    expect(readListened()).toEqual({ day: '2026-10-09', at: at.toISOString() });
    expect(localDay(at)).toBe('2026-10-09');
  });
});
