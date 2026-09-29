import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SendLinkDialog } from './SendLinkDialog';

const cleanups: (() => void)[] = [];

const renderDialog = (email: string, onSend = vi.fn()) => {
  render(
    <SendLinkDialog
      title="Véhicule prêt"
      intro="Message pré-rédigé."
      message={{ subject: 'Véhicule prêt', body: 'Bonjour', sms: 'Bonjour' }}
      senderEmail="atelier@rapidtruckservice.fr"
      contact={{ email, phone: '' }}
      onContactSave={vi.fn()}
      onSend={onSend}
      onClose={vi.fn()}
    />,
  );
  const link = screen.getByRole('link', { name: /messagerie de l’ordinateur/ });
  // Écouté sur le document, donc après le gestionnaire de l'appli (délégation React) ;
  // le lien « mailto: » n'est jamais suivi dans le test.
  const opened = vi.fn();
  const listener = (event: MouseEvent) => {
    if (event.target instanceof Node && link.contains(event.target)) {
      opened(!event.defaultPrevented);
      event.preventDefault();
    }
  };
  document.addEventListener('click', listener);
  cleanups.push(() => document.removeEventListener('click', listener));
  return { link, onSend, opened };
};

afterEach(() => {
  vi.restoreAllMocks();
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe('fenêtre d’envoi', () => {
  it('Gmail s’ouvre sur le compte de l’atelier', () => {
    renderDialog('client@exemple.fr');
    expect(screen.getByRole('link', { name: 'Ouvrir dans Gmail' }).getAttribute('href')).toContain(
      'authuser=atelier%40rapidtruckservice.fr',
    );
  });

  it('sans e-mail du client : confirmation ; « Annuler » n’ouvre rien et ne trace rien', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { link, onSend, opened } = renderDialog('');
    await userEvent.click(link);
    expect(confirm).toHaveBeenCalledWith('Aucun e-mail client renseigné. Ouvrir quand même la messagerie ?');
    expect(opened).toHaveBeenCalledWith(false);
    expect(onSend).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(link);
    expect(opened).toHaveBeenLastCalledWith(true);
    expect(onSend).toHaveBeenCalledWith('email', { email: '', phone: '' });
  });

  it('avec un e-mail : pas de confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { link, onSend, opened } = renderDialog('client@exemple.fr');
    await userEvent.click(link);
    expect(confirm).not.toHaveBeenCalled();
    expect(opened).toHaveBeenCalledWith(true);
    expect(onSend).toHaveBeenCalledWith('email', { email: 'client@exemple.fr', phone: '' });
  });
});
