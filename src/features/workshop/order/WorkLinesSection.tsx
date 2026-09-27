import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { RoLine } from '@/features/repair-orders/api';
import { addLine, deleteLine, updateLine, type LinePatch } from '../api';
import { parseTimeOption, timeOptionsFor, timeOptionValue } from '../domain';
import { useWorkshopMutation } from '../hooks';

const EDITABLE_TYPES: RoLine['line_type'][] = ['labor', 'text'];

/** Libellé d'un forfait sans le mot « forfait » côté atelier (comme l'ancienne appli). */
const displayDescription = (line: RoLine) =>
  line.line_type === 'package' ? line.description.replace(/forfait\s*/gi, '').trim() : line.description;

function LineRow({ line, locked, repairOrderId }: { line: RoLine; locked: boolean; repairOrderId: string }) {
  const update = useWorkshopMutation(repairOrderId, (patch: LinePatch) => updateLine(line.id, patch));
  const remove = useWorkshopMutation(repairOrderId, () => deleteLine(line.id), 'Tâche supprimée');
  const editable = !locked && EDITABLE_TYPES.includes(line.line_type);
  const time = timeOptionValue(line.estimated_hours, line.estimate_is_minimum);

  return (
    <li className="flex flex-wrap items-start gap-2 border-b py-3 last:border-0">
      <div className="min-w-0 flex-1 basis-60 space-y-1">
        <Textarea
          aria-label="Description de la tâche"
          rows={2}
          className="min-h-11 text-base"
          placeholder="Ex : Remplacement plaquettes"
          defaultValue={displayDescription(line)}
          key={line.description}
          disabled={!editable}
          onBlur={(event) => {
            const description = event.target.value.trim();
            if (description !== line.description) update.mutate({ description });
          }}
        />
        {line.line_type === 'package' && <Badge variant="secondary">Forfait</Badge>}
      </div>
      <select
        aria-label="Temps estimé"
        className="h-11 rounded-md border bg-transparent px-3 text-base disabled:opacity-50"
        disabled={locked}
        value={time}
        onChange={(event) => update.mutate(parseTimeOption(event.target.value))}
      >
        <option value="">Estim. —</option>
        {timeOptionsFor(time).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {editable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Supprimer la tâche"
          disabled={remove.isPending}
          onClick={() => remove.mutate(undefined)}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function LineGroup({
  title,
  kind,
  lines,
  locked,
  repairOrderId,
}: {
  title: string;
  kind: RoLine['kind'];
  lines: RoLine[];
  locked: boolean;
  repairOrderId: string;
}) {
  const add = useWorkshopMutation(repairOrderId, () =>
    addLine(repairOrderId, kind, Math.max(-1, ...lines.map((line) => line.position)) + 1),
  );
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {lines.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Aucune tâche ajoutée pour l’instant.</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <LineRow key={line.id} line={line} locked={locked} repairOrderId={repairOrderId} />
          ))}
        </ul>
      )}
      {!locked && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={add.isPending}
          onClick={() => add.mutate(undefined)}
        >
          <Plus /> Ajouter une tâche
        </Button>
      )}
    </section>
  );
}

/** Travaux effectués (avec le temps passé) et travaux / pièces à prévoir pour le devis. */
export function WorkLinesSection({
  repairOrderId,
  lines,
  locked,
}: {
  repairOrderId: string;
  lines: RoLine[];
  locked: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Intervention atelier</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <LineGroup
          title="Travaux effectués"
          kind="done"
          lines={lines.filter((line) => line.kind === 'done' && line.line_type !== 'part')}
          locked={locked}
          repairOrderId={repairOrderId}
        />
        <LineGroup
          title="Pièces / réparations à prévoir (devis)"
          kind="planned"
          lines={lines.filter((line) => line.kind === 'planned' && line.line_type !== 'part')}
          locked={locked}
          repairOrderId={repairOrderId}
        />
      </CardContent>
    </Card>
  );
}
