import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RoLine } from '../api';
import { LinesCard } from './LinesCard';

const line = (fields: Partial<RoLine>) =>
  ({
    id: fields.description,
    kind: 'planned',
    line_type: 'labor',
    visibility: 'all',
    estimated_hours: null,
    estimate_is_minimum: false,
    standard_hours: null,
    billed_hours: null,
    unit_price: null,
    quantity: 1,
    ...fields,
  }) as RoLine;

describe('intervention atelier', () => {
  it('forfaits des pneus : quantité et prix unitaire, pas leur temps de barème', () => {
    render(
      <LinesCard
        lines={[
          line({
            description: 'DÉPOSE/REPOSE PNEUMATIQUE (avant)',
            line_type: 'package',
            visibility: 'quote',
            standard_hours: 0,
            unit_price: 18,
            quantity: 2,
          }),
          line({ description: 'Remplacement Pneus avant', visibility: 'workshop', estimated_hours: 1 }),
          line({ description: 'Contrôle hayon', standard_hours: 0.5 }),
        ]}
      />,
    );
    expect(screen.getByText('2 × 18,00 € HT')).toBeInTheDocument();
    expect(screen.queryByText('0 h (barème)')).not.toBeInTheDocument();
    expect(screen.getByText('1 h')).toBeInTheDocument();
    expect(screen.getByText('0,5 h (barème)')).toBeInTheDocument();
  });
});
