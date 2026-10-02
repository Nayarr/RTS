import { useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { RoLine } from '@/features/repair-orders/api';
import { addLine, deleteLine, updateLine, type LinePatch } from '../api';
import { parseTimeOption, timeOptionLabel, timeOptionsFor, timeOptionValue } from '../domain';
import { useWorkshopMutation } from '../hooks';

const EDITABLE_TYPES: RoLine['line_type'][] = ['labor', 'text'];

/** Libellé d'un forfait sans le mot « forfait » côté atelier (comme l'ancienne appli). */
const displayDescription = (line: RoLine) =>
  line.line_type === 'package' ? line.description.replace(/forfait\s*/gi, '').trim() : line.description;

function LineRow({ line, locked, repairOrderId }: { line: RoLine; locked: boolean; repairOrderId: string }) {
  const update = useWorkshopMutation(repairOrderId, (patch: LinePatch) => updateLine(line.id, patch));
  const remove = useWorkshopMutation(repairOrderId, () => deleteLine(line.id), 'Tâche supprimée');
  const editable = !locked && EDITABLE_TYPES.includes(line.line_type);
  // Travail effectué finalement non fait (forfait compris) : le technicien peut le retirer.
  const removable = editable || (!locked && line.kind === 'done' && line.line_type === 'package');
  // Travail repris du devis accepté : retrait confirmé (il ne sera pas facturé).
  const fromQuote = line.source_quote_line_id !== null;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const time = timeOptionValue(line.estimated_hours, line.estimate_is_minimum);

  return (
    <li className="row items-start gap-2 rounded-[7px] border p-2">
      <div className="col min-w-0 grow gap-1">
        <Textarea
          aria-label="Description de la tâche"
          rows={1}
          className="field-sizing-content min-h-9 resize-none border-0 bg-transparent px-1.5 py-1.5 text-sm shadow-none focus-visible:ring-0 disabled:opacity-100"
          placeholder="Ex : Remplacement plaquettes"
          defaultValue={displayDescription(line)}
          key={line.description}
          disabled={!editable}
          onBlur={(event) => {
            const description = event.target.value.trim();
            if (description !== line.description) update.mutate({ description });
          }}
        />
        {line.line_type === 'package' && <span className="tag ml-1.5 self-start">Forfait</span>}
        {line.estimate_locked && (
          <span className="hint row ml-1.5 gap-1" id={`line-${line.id}-locked`}>
            <Lock className="size-3" /> Temps fixé par le devis
          </span>
        )}
      </div>
      <select
        aria-label="Temps estimé"
        aria-describedby={line.estimate_locked ? `line-${line.id}-locked` : undefined}
        className="inp h-9! w-auto shrink-0 text-[13px]!"
        disabled={locked || line.estimate_locked}
        value={time}
        onChange={(event) => update.mutate(parseTimeOption(event.target.value))}
      >
        <option value="">
          {/* Forfait sans estimation : son temps barème s'applique */}
          {line.kind === 'planned' && line.line_type === 'package' && line.standard_hours !== null
            ? `Barème ${timeOptionLabel(`${line.standard_hours}h`)}`
            : 'Estim. —'}
        </option>
        {timeOptionsFor(time).map((option) => (
          <option key={option} value={option}>
            {timeOptionLabel(option)}
          </option>
        ))}
      </select>
      {removable && (
        <button
          type="button"
          className="ibtn sm ghost shrink-0 text-muted-foreground"
          aria-label="Supprimer la tâche"
          disabled={remove.isPending}
          onClick={() => (fromQuote ? setConfirmRemove(true) : remove.mutate(undefined))}
        >
          <Trash2 className="i s" />
        </button>
      )}
      {fromQuote && (
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title="Retirer ce travail ?"
          description={`« ${displayDescription(line)} » n’a finalement pas été fait : il est retiré de l’OR et ne sera pas facturé. Le bureau le voit dans l’historique.`}
          confirmLabel="Retirer"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirmRemove(false) })}
        />
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
  compactAdd = false,
}: {
  title: string;
  kind: RoLine['kind'];
  lines: RoLine[];
  locked: boolean;
  repairOrderId: string;
  /** Bouton « + » seul (titre long). */
  compactAdd?: boolean;
}) {
  const add = useWorkshopMutation(repairOrderId, () =>
    addLine(repairOrderId, kind, Math.max(-1, ...lines.map((line) => line.position)) + 1),
  );
  const headingId = `tech-lines-${kind}`;
  return (
    <section data-slot="card" className="card sec" aria-labelledby={headingId}>
      <div className="sec-t">
        <h2 id={headingId}>{title}</h2>
        {!locked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            aria-label="Ajouter une tâche"
            disabled={add.isPending}
            onClick={() => add.mutate(undefined)}
          >
            <Plus />
            {!compactAdd && 'Ajouter'}
          </Button>
        )}
      </div>
      {lines.length === 0 ? (
        <p className="hint">Aucune tâche ajoutée pour l’instant.</p>
      ) : (
        <ul className="col gap-2">
          {lines.map((line) => (
            <LineRow key={line.id} line={line} locked={locked} repairOrderId={repairOrderId} />
          ))}
        </ul>
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
    <>
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
        compactAdd
      />
    </>
  );
}
