import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InspectionCard } from './InspectionCard';

describe('fiche de contrôle côté bureau', () => {
  it('étiquette du hayon scannée sur l’OR : mois du prochain contrôle entre parenthèses', () => {
    render(
      <InspectionCard
        vehicleType="pl"
        data={{ controles: { hayon: 'OK', etiquettes: 'OK' }, hayon_echeance: '2027-03-01' }}
      />,
    );
    expect(screen.getByText('Étiquette contrôle hayon (03/2027)')).toBeInTheDocument();
    expect(screen.getByText('Étiquettes angles morts')).toBeInTheDocument();
  });

  it('pas de scan : libellé seul', () => {
    render(<InspectionCard vehicleType="pl" data={{ controles: { hayon: 'HS' } }} />);
    expect(screen.getByText('Étiquette contrôle hayon')).toBeInTheDocument();
  });
});
