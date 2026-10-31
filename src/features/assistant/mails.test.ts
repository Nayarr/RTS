import { describe, expect, it } from 'vitest';
import { replyMailbox } from './mails';

describe('boîte de la réponse', () => {
  it('celle qui a reçu le mail, atelier@ sinon', () => {
    expect(replyMailbox('comptoir@rapidtruckservice.fr')).toBe('comptoir@');
    expect(replyMailbox('atelier@rapidtruckservice.fr')).toBe('atelier@');
    expect(replyMailbox(null)).toBe('atelier@');
  });
});
