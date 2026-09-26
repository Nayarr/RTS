import { AuthError } from '@supabase/supabase-js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeSession, renderRoutes } from '@/test/render';
import { requestPasswordReset, signIn } from './api';
import type * as ApiModule from './api';
import { LoginPage } from './LoginPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  signIn: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

const routes = [
  { path: '/connexion', element: <LoginPage /> },
  { path: '/', element: <p>Accueil</p> },
];

const renderLogin = (auth = {}) => renderRoutes(routes, { initialPath: '/connexion', auth });

describe('LoginPage', () => {
  it('affiche les erreurs de saisie sans appeler Supabase', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('Adresse e-mail invalide')).toBeInTheDocument();
    expect(screen.getByText('Renseigne ton mot de passe')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('se connecte avec l’e-mail nettoyé', async () => {
    vi.mocked(signIn).mockResolvedValue();
    renderLogin();
    await userEvent.type(screen.getByLabelText('E-mail'), '  tech@rts.fr ');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(signIn).toHaveBeenCalledWith('tech@rts.fr', 'secret');
  });

  it('affiche « Identifiants incorrects » en cas de refus', async () => {
    vi.mocked(signIn).mockRejectedValue(
      new AuthError('Invalid login credentials', 400, 'invalid_credentials'),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText('E-mail'), 'tech@rts.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'mauvais');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('Identifiants incorrects.')).toBeInTheDocument();
  });

  it('envoie le lien de réinitialisation du mot de passe', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue();
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    await userEvent.type(screen.getByLabelText('E-mail'), 'tech@rts.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    expect(requestPasswordReset).toHaveBeenCalledWith('tech@rts.fr');
    expect(await screen.findByText(/un e-mail vient d’être envoyé/)).toBeInTheDocument();
  });

  it('redirige vers l’accueil si déjà connecté', async () => {
    renderLogin({ session: fakeSession() });
    expect(await screen.findByText('Accueil')).toBeInTheDocument();
  });
});
