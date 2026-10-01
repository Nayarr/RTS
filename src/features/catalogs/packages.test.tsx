import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { fetchPackages, removePackage, savePackage, type ServicePackage } from './api';
import type * as CatalogsApi from './api';
import { categoryLabel, packageFromForm, packageToForm, parseKeywords } from './package-form';
import { PackagesPage } from './PackagesPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogsApi>()),
  fetchPackages: vi.fn(),
  savePackage: vi.fn(),
  removePackage: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const pkg = (overrides: Partial<ServicePackage> = {}): ServicePackage =>
  ({
    id: 'p1',
    name: 'Forfait disques et plaquettes arrière PL',
    category: 'pl',
    standard_hours: 3,
    price: 340,
    details: 'Dépose des roues arrière\nRemplacement disques et plaquettes',
    keywords: ['disque arrière', 'plaquette arrière'],
    trigger_fields: ['disques_arriere', 'plaquettes_arriere'],
    is_active: true,
    ...overrides,
  }) as ServicePackage;

beforeEach(() => {
  vi.mocked(fetchPackages).mockResolvedValue([
    pkg(),
    pkg({
      id: 'p2',
      name: 'Vidange',
      category: null,
      price: null,
      keywords: [],
      trigger_fields: [],
      details: null,
    }),
  ]);
  vi.mocked(savePackage).mockResolvedValue(undefined);
  vi.mocked(removePackage).mockResolvedValue(undefined);
});

const renderPage = () =>
  renderRoutes([{ path: '/stock/forfaits', element: <PackagesPage /> }], { initialPath: '/stock/forfaits' });

describe('forfaits : règles', () => {
  it('mots-clés, catégorie, aller-retour du formulaire', () => {
    expect(parseKeywords(' disque  arrière, plaquette arrière,, disque arrière ')).toEqual([
      'disque arrière',
      'plaquette arrière',
    ]);
    expect(categoryLabel(null)).toBe('Toutes catégories');
    expect(categoryLabel('tolerie')).toBe('Tôlerie / carrosserie');
    expect(packageToForm(pkg({ category: null })).category).toBe(''); // « Toutes catégories » reste ainsi
    expect(packageToForm(null).category).toBe('pl');
    const values = packageToForm(pkg());
    expect(values).toMatchObject({
      standard_hours: '3',
      price: '340',
      keywords: 'disque arrière, plaquette arrière',
    });
    expect(packageFromForm({ ...values, category: '', price: '', standard_hours: '2,5' })).toMatchObject({
      category: null,
      price: null,
      standard_hours: 2.5,
    });
  });
});

describe('forfaits : écran', () => {
  it('liste : catégorie, barème, prix, mots-clés, cases de la fiche de contrôle', async () => {
    renderPage();
    const card = await screen.findByRole('article', { name: 'Forfait disques et plaquettes arrière PL' });
    expect(card).toHaveTextContent(/PL3 h barème/);
    expect(card).toHaveTextContent(/Prix forfaitaire HT340,00\s€/);
    expect(card).toHaveTextContent('Mots-clés :disque arrièreplaquette arrière');
    expect(card).toHaveTextContent('Fiche de contrôle : Disques de frein arrière, Plaquettes arrière');
    expect(screen.getByRole('article', { name: 'Vidange' })).toHaveTextContent('Toutes catégories3 h barème');
    expect(screen.getByRole('link', { name: 'Forfaits' })).toHaveAttribute('aria-current', 'page');
  });

  it('nouveau forfait : barème obligatoire, cases cochées, enregistrement', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau forfait' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau forfait' });
    await userEvent.type(within(dialog).getByLabelText('Nom du forfait'), 'Forfait plaquettes avant');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter le forfait' }));
    expect(await within(dialog).findByText('Champ obligatoire')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Temps barème (heures)'), '1,5');
    await userEvent.type(within(dialog).getByLabelText('Prix forfaitaire HT (€)'), '180');
    await userEvent.type(within(dialog).getByLabelText(/Mots-clés/), 'plaquette avant');
    await userEvent.click(within(dialog).getByLabelText('Plaquettes avant'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter le forfait' }));
    await waitFor(() =>
      expect(savePackage).toHaveBeenCalledWith(null, {
        name: 'Forfait plaquettes avant',
        category: 'pl',
        standard_hours: 1.5,
        price: 180,
        keywords: ['plaquette avant'],
        trigger_fields: ['plaquettes_avant'],
        details: null,
      }),
    );
  });

  it('modifier puis supprimer un forfait', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier Vidange' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier le forfait' });
    expect(within(dialog).getByLabelText('Catégorie')).toHaveDisplayValue(/^Toutes catégories/);
    await userEvent.type(within(dialog).getByLabelText('Prix forfaitaire HT (€)'), '99');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(savePackage).toHaveBeenCalledWith('p2', expect.objectContaining({ price: 99 })),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer Vidange' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(removePackage).toHaveBeenCalledWith('p2'));
  });
});
