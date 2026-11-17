import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { issueWarnings } from '@/features/invoices/domain';
import { orNewClientSchema } from '@/features/repair-orders/schemas';
import { countryName, FOREIGN_COUNTRIES, foreignIdLine, isForeign } from '@/lib/countries';
import { createPdf } from '@/lib/pdf';
import { drawClientBox } from '@/lib/pdf-document';
import { CompanyIdFields } from './CompanyIdFields';
import { emptyNewClient, newClientFromForm, newClientSchema, type NewClientValues } from './domain';

const pro = (overrides: Partial<NewClientValues> = {}): NewClientValues => ({
  ...emptyNewClient('pro'),
  name: 'Transport Peeters',
  ...overrides,
});
const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.')) ?? [];

describe('client étranger : pays et n° d’entreprise à la place du SIRET', () => {
  it('pays : noms en français, France exclue, ordre alphabétique', () => {
    expect(countryName('BE')).toBe('Belgique');
    expect(FOREIGN_COUNTRIES.some((country) => country.value === 'FR')).toBe(false);
    const labels = FOREIGN_COUNTRIES.map((country) => country.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'fr')));
    expect(isForeign('BE')).toBe(true);
    expect(isForeign('FR')).toBe(false);
    expect(isForeign(null)).toBe(false);
  });

  it('ligne imprimée : n° et pays, rien sans n° ni pour un client français', () => {
    expect(foreignIdLine('BE', ' BE 0123.456.789 ')).toBe('N° d’entreprise BE 0123.456.789 (Belgique)');
    expect(foreignIdLine('BE', '')).toBeNull();
    expect(foreignIdLine('FR', '123')).toBeNull();
  });

  it('fiche : pays obligatoire, SIRET ni exigé ni contrôlé', () => {
    expect(issues(newClientSchema.safeParse(pro({ foreign: true })))).toEqual(['country']);
    expect(newClientSchema.safeParse(pro({ foreign: true, country: 'BE', siret: '0123' })).success).toBe(
      true,
    );
    // Client français : SIRET toujours contrôlé
    expect(issues(newClientSchema.safeParse(pro({ siret: '0123' })))).toEqual(['siret']);
    expect(issues(newClientSchema.safeParse(pro({ foreign: true, country: 'BE', foreign_id: 'X' })))).toEqual(
      ['foreign_id'],
    );
  });

  it('OR : client étranger créé sans SIRET', () => {
    const contact = { phone: '+32 2 123 45 67', email: 'info@peeters.be', billing_address: 'Bruxelles' };
    expect(issues(orNewClientSchema.safeParse(pro(contact)))).toEqual(['siret']);
    expect(orNewClientSchema.safeParse(pro({ ...contact, foreign: true, country: 'BE' })).success).toBe(true);
  });

  it('enregistrement : pas de SIRET, pays et n° gardés ; France sinon', () => {
    expect(
      newClientFromForm(
        pro({ foreign: true, country: 'BE', foreign_id: ' BE 0123.456.789 ', siret: '984 989 137 00018' }),
      ),
    ).toMatchObject({ siret: null, country: 'BE', foreign_id: 'BE 0123.456.789' });
    expect(newClientFromForm(pro({ siret: '984 989 137 00018', foreign_id: 'oublié' }))).toMatchObject({
      siret: '98498913700018',
      country: 'FR',
      foreign_id: null,
    });
    expect(
      newClientFromForm({ ...emptyNewClient('individual'), first_name: 'Ana', last_name: 'Lopes' }),
    ).toMatchObject({ siret: null, country: 'FR', foreign_id: null });
  });

  it('facture : « SIRET du client manquant » seulement pour un client français', () => {
    const client = { name: 'Peeters', billing_address: 'Bruxelles', siret: null, email: null };
    expect(issueWarnings([], { ...client, country: 'BE', foreign_id: null })).toEqual([]);
    expect(issueWarnings([], { ...client, country: 'FR' })).toEqual(['SIRET du client manquant']);
  });

  it('PDF : n° d’entreprise et pays dans le cadre du client', async () => {
    const { doc } = await createPdf();
    const text = vi.spyOn(doc, 'text');
    drawClientBox(doc, 'Facturé à', {
      name: 'Transport Peeters',
      billing_address: 'Bruxelles',
      country: 'BE',
      foreign_id: 'BE 0123.456.789',
    });
    const printed = text.mock.calls.map(([value]) => String(value));
    expect(printed).toContain('N° d’entreprise BE 0123.456.789 (Belgique)');
    expect(printed.some((value) => value.startsWith('SIRET'))).toBe(false);
  });
});

function Fields() {
  const form = useForm<NewClientValues>({ defaultValues: pro() });
  return <CompanyIdFields form={form} idPrefix="t" />;
}

describe('case « Client étranger »', () => {
  it('cochée : pays et n° d’entreprise remplacent le SIRET', async () => {
    render(<Fields />);
    expect(screen.getByLabelText('SIRET')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Client étranger'));
    expect(screen.queryByLabelText('SIRET')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Pays *'), 'Belgique');
    expect(screen.getByLabelText('Pays *')).toHaveValue('BE');
    expect(screen.getByLabelText('N° d’entreprise du pays')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Client étranger'));
    expect(screen.getByLabelText('SIRET')).toBeInTheDocument();
  });
});
