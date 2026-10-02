import { cn } from '@/lib/utils';
import { taskLines } from './tasks';

/** « Tâche à faire » : une tâche par ligne, alignées sous une puce dès qu'il y en a plusieurs. */
export function TaskList({ text, className }: { text: string | null | undefined; className?: string }) {
  const lines = taskLines(text);
  if (lines.length <= 1) return <p className={className}>{lines[0] ?? ''}</p>;
  return (
    <ul className={cn('col list-disc gap-0.5 pl-5 marker:text-muted-foreground', className)}>
      {lines.map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ul>
  );
}
