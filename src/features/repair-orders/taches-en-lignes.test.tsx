import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { toNewRepairOrderInput, newRepairOrderDefaults } from './schemas';
import { TaskLinesInput } from './TaskLinesInput';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="tasks">Tâche à faire</label>
      <TaskLinesInput id="tasks" value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const value = () => JSON.parse(screen.getByTestId('value').textContent ?? '""') as string;

describe('tâches à faire ligne par ligne', () => {
  it('Entrée ouvre la tâche suivante, une ligne vide ne s’ajoute pas', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Tâche à faire'), 'Vidange{Enter}');
    const second = screen.getByLabelText('Tâche 2');
    expect(second).toHaveFocus();
    await userEvent.type(second, 'Freins avant{Enter}{Enter}');
    expect(screen.queryByLabelText('Tâche 4')).toBeNull();
    expect(value()).toBe('Vidange\nFreins avant\n');
  });

  it('« Ajouter une tâche » et retrait d’une ligne', async () => {
    render(<Harness initial={'Vidange\nFreins'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une tâche' }));
    expect(screen.getByLabelText('Tâche 3')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la tâche 1' }));
    expect(screen.getByLabelText('Tâche à faire')).toHaveValue('Freins');
    // Retour arrière sur une ligne vide : elle disparaît
    await userEvent.type(screen.getByLabelText('Tâche 2'), '{Backspace}');
    expect(screen.queryByLabelText('Tâche 2')).toBeNull();
    expect(value()).toBe('Freins');
  });

  it('texte collé sur plusieurs lignes : une tâche par ligne', () => {
    render(<Harness />);
    fireEvent.paste(screen.getByLabelText('Tâche à faire'), {
      clipboardData: { getData: () => 'Vidange\r\n\r\n  Kit accessoires \nÉtiquettes' },
    });
    expect(value()).toBe('Vidange\nKit accessoires\nÉtiquettes');
  });

  it('envoi : lignes vides retirées', () => {
    const input = toNewRepairOrderInput(
      { ...newRepairOrderDefaults(), plate: 'AB-123-CD', requested_work: 'Vidange\n\n Freins \n' },
      null,
    );
    expect(input.requested_work).toBe('Vidange\nFreins');
  });
});
