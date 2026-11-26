import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSession, renderRoutes } from '@/test/render';
import { fetchQuoteNumber } from './api';
import type * as QuotesApi from './api';
import { OriginQuoteButton } from './OriginQuoteButton';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof QuotesApi>()),
  fetchQuoteNumber: vi.fn(),
}));

const QUOTE_ID = '00000000-0000-0000-0000-00000000d012';

const render = (quoteId: string | null) =>
  renderRoutes(
    [
      {
        path: '/or/:id',
        element: (
          <>
            <h1>Fiche OR</h1>
            <OriginQuoteButton quoteId={quoteId} />
          </>
        ),
      },
      { path: '/devis/:id', element: <p>Page du devis</p> },
    ],
    { initialPath: '/or/ro1', auth: { session: fakeSession() } },
  );

beforeEach(() => {
  vi.mocked(fetchQuoteNumber).mockReset();
});

describe('bouton du devis d’origine sur la fiche OR', () => {
  it('OR créé depuis un devis : « Devis DV00012 » ouvre la page de ce devis', async () => {
    vi.mocked(fetchQuoteNumber).mockResolvedValue('DV00012');
    const { router } = render(QUOTE_ID);

    const link = await screen.findByRole('link', { name: 'Devis DV00012' });
    expect(link).toHaveAttribute('href', `/devis/${QUOTE_ID}`);
    expect(fetchQuoteNumber).toHaveBeenCalledWith(QUOTE_ID);

    await userEvent.click(link);
    expect(await screen.findByText('Page du devis')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/devis/${QUOTE_ID}`);
  });

  it('devis sans numéro : libellé « Devis d’origine »', async () => {
    vi.mocked(fetchQuoteNumber).mockResolvedValue(null);
    render(QUOTE_ID);

    await waitFor(() => expect(fetchQuoteNumber).toHaveBeenCalled());
    expect(await screen.findByRole('link', { name: 'Devis d’origine' })).toHaveAttribute(
      'href',
      `/devis/${QUOTE_ID}`,
    );
  });

  it('OR sans devis d’origine : pas de bouton ni de requête', async () => {
    render(null);

    expect(await screen.findByRole('heading', { name: 'Fiche OR' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Devis/ })).not.toBeInTheDocument();
    expect(fetchQuoteNumber).not.toHaveBeenCalled();
  });
});
