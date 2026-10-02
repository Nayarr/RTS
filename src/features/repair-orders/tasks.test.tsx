import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { taskLines, taskSummary } from './tasks';
import { TaskList } from './TaskList';

describe('tâches à faire d’un OR', () => {
  const work =
    'Remplacement Barre d’accouplement\n  Remplacement Kit accessoires \n\nRemplacement Extincteur 6 kg camion';

  it('une tâche par ligne, sans espaces ni lignes vides', () => {
    expect(taskLines(work)).toEqual([
      'Remplacement Barre d’accouplement',
      'Remplacement Kit accessoires',
      'Remplacement Extincteur 6 kg camion',
    ]);
    expect(taskLines(null)).toEqual([]);
  });

  it('résumé sur une ligne pour les listes et l’écran atelier', () => {
    expect(taskSummary(work)).toBe(
      'Remplacement Barre d’accouplement · Remplacement Kit accessoires · Remplacement Extincteur 6 kg camion',
    );
    expect(taskSummary('Vidange')).toBe('Vidange');
  });

  it('plusieurs tâches : une liste, chacune sur sa ligne', () => {
    render(<TaskList text={work} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(taskLines(work));
  });

  it('une seule tâche : un simple paragraphe', () => {
    render(<TaskList text="Diagnostic électronique" />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('Diagnostic électronique')).toBeInTheDocument();
  });
});
