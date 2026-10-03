import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RepairOrderOverview } from '../api';
import { formatShortDuration } from '../constants';
import { TimeCard } from './TimeCard';

describe('temps passé', () => {
  it('durée avec son unité', () => {
    expect([0, 540, 3599, 3600, 5400, 7500].map(formatShortDuration)).toEqual([
      '0 min',
      '9 min',
      '1h',
      '1h',
      '1h30',
      '2h05',
    ]);
  });

  it('badgé, déclaré et écart affichés avec leur unité', () => {
    const order = {
      worked_seconds: 540,
      running_since: null,
      declared_hours: 1.5,
    } as unknown as RepairOrderOverview;
    render(<TimeCard order={order} loadedAt={Date.now()} showComparison />);
    expect(screen.getByText('9 min')).toBeInTheDocument();
    expect(screen.getByText('1h30')).toBeInTheDocument();
    expect(screen.getByText('−1h21')).toBeInTheDocument();
  });
});
