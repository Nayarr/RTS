import { AuthError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './api';

describe('authErrorMessage', () => {
  it('identifiants incorrects', () => {
    expect(authErrorMessage(new AuthError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(
      'Identifiants incorrects.',
    );
  });

  it('compte désactivé par la direction', () => {
    expect(authErrorMessage(new AuthError('User is banned', 400, 'user_banned'))).toBe(
      'Ce compte est désactivé. Contacte la direction.',
    );
  });

  it('trop de tentatives', () => {
    expect(authErrorMessage(new AuthError('Too many requests', 429))).toBe(
      'Trop de tentatives. Réessaie dans quelques minutes.',
    );
  });

  it('réseau indisponible', () => {
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Connexion impossible : vérifie ta connexion internet.',
    );
  });

  it('erreur inconnue', () => {
    expect(authErrorMessage(new Error('boom'))).toBe(
      'Une erreur est survenue. Réessaie ou contacte le bureau.',
    );
  });
});
