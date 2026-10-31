import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { nextPositionOf } from '@/features/documents/lines';
import { addLine, deleteLine, updateLine } from '@/features/workshop/api';
import { decimalValue, formatEuro, formatQuantity, parseDecimal } from '@/lib/numbers';
import type { RoLine } from '../api';
import { formatHours } from '../constants';
import { useRepairOrderMutation } from '../hooks';

const TYPE_LABELS: Partial<Record<RoLine['line_type'], string>> = { package: 'Forfait' };

/** Où va la ligne : forfaits des pneus au devis seulement, remplacement des pneus à l'atelier seulement. */
const VISIBILITY_LABELS: Partial<Record<string, string>> = {
  quote: 'Devis et facture seulement',
  workshop: 'Atelier seulement (pas au devis)',
};

const SECTION_LABELS: Record<RoLine['kind'], string> = { done: 'travaux effectués', planned: 'à prévoir' };

/** Temps de la ligne ; forfait au devis seulement (pneus) : son prix, son temps ne compte pas. */
function lineAmount(line: RoLine) {
  if (line.visibility === 'quote' && line.unit_price !== null) {
    return `${formatQuantity(line.quantity)} × ${formatEuro(line.unit_price)} HT`;
  }
  if (line.estimated_hours === null) {
    return line.standard_hours === null || line.kind === 'done'
      ? '-'
      : `${formatHours(line.standard_hours)} (barème)`;
  }
  return `${formatHours(line.estimated_hours)}${line.estimate_is_minimum ? '+' : ''}${
    line.kind === 'done' ? ' réel' : ''
  }`;
}

/** Temps saisi : vide (pas de temps), ou nombre d'heures positif (« 1,5 »). */
const validHours = (value: string) => {
  const parsed = parseDecimal(value);
  return parsed === null || (!Number.isNaN(parsed) && parsed > 0 && parsed <= 99);
};

/** Texte d'une ligne modifié par le bureau (description seulement). */
function LineTextEditor({ line, onDone }: { line: RoLine; onDone: () => void }) {
  const [text, setText] = useState(line.description);
  const save = useRepairOrderMutation(
    (description: string) => updateLine(line.id, { description }),
    'Ligne modifiée',
  );
  return (
    <form
      className="col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) save.mutate(text.trim(), { onSuccess: onDone });
      }}
    >
      <Textarea
        aria-label={`Texte de la ligne : ${line.description}`}
        rows={2}
        value={text}
        autoFocus
        onChange={(event) => setText(event.target.value)}
      />
      <div className="row gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || !text.trim()}>
          Enregistrer
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Nouvelle ligne ajoutée par le bureau : texte et temps facultatif. */
function NewLineForm({
  repairOrderId,
  kind,
  lines,
  onDone,
}: {
  repairOrderId: string;
  kind: RoLine['kind'];
  lines: RoLine[];
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [time, setTime] = useState('');
  const add = useRepairOrderMutation(async () => {
    const line = await addLine(repairOrderId, kind, nextPositionOf(lines), text.trim());
    const hours = decimalValue(time);
    if (hours !== null) await updateLine(line.id, { estimated_hours: hours });
  }, 'Ligne ajoutée');
  const timeOk = validHours(time);
  return (
    <form
      className="col gap-2 border-t pt-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() && timeOk) add.mutate(undefined, { onSuccess: onDone });
      }}
    >
      <Textarea
        aria-label={`Nouvelle ligne (${SECTION_LABELS[kind]})`}
        placeholder="Ex : Remplacement plaquettes avant"
        rows={2}
        value={text}
        autoFocus
        onChange={(event) => setText(event.target.value)}
      />
      <div className="row flex-wrap items-center gap-2">
        <Input
          aria-label={`Temps en heures (${SECTION_LABELS[kind]})`}
          aria-invalid={timeOk ? undefined : true}
          inputMode="decimal"
          placeholder="Temps (h), facultatif"
          className="h-9 w-44"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={add.isPending || !text.trim() || !timeOk}>
          Ajouter
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Annuler
        </Button>
      </div>
      {!timeOk && <p className="err">Temps en heures (ex : 1,5)</p>}
    </form>
  );
}

/** Boutons du bureau sur une ligne : modifier le texte, supprimer (avec confirmation). */
function LineActions({ line, onEdit }: { line: RoLine; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useRepairOrderMutation(() => deleteLine(line.id), 'Ligne supprimée');
  const name = line.description || 'ligne sans description';
  return (
    <span className="row shrink-0 gap-0.5">
      <button type="button" className="ibtn sm ghost" aria-label={`Modifier : ${name}`} onClick={onEdit}>
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        className="ibtn sm ghost"
        aria-label={`Supprimer : ${name}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
      </button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Supprimer cette ligne ?"
        description={name}
        confirmLabel="Supprimer"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirming(false) })}
      />
    </span>
  );
}

function LineList({ lines, empty, editable }: { lines: RoLine[]; empty: string; editable: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (lines.length === 0) return <p className="hint py-2.5">{empty}</p>;
  return (
    <ul>
      {lines.map((line) => (
        <li key={line.id} className="row between top gap-2 border-b py-2.5 last:border-b-0">
          {editing === line.id ? (
            <div className="grow">
              <LineTextEditor line={line} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <>
              <span className="col min-w-0 grow gap-1">
                <span className="whitespace-pre-line">{line.description || <em>(sans description)</em>}</span>
                {(TYPE_LABELS[line.line_type] ?? VISIBILITY_LABELS[line.visibility]) && (
                  <span className="row gap-1.5">
                    {TYPE_LABELS[line.line_type] && (
                      <span className="tag self-start">{TYPE_LABELS[line.line_type]}</span>
                    )}
                    {VISIBILITY_LABELS[line.visibility] && (
                      <span className="tag self-start">{VISIBILITY_LABELS[line.visibility]}</span>
                    )}
                  </span>
                )}
              </span>
              <span className="col shrink-0 items-end gap-0.5">
                <span className="muted num">{lineAmount(line)}</span>
                {line.kind === 'done' && line.billed_hours !== null && line.visibility !== 'quote' && (
                  <span className="hint num">facturé {formatHours(line.billed_hours)}</span>
                )}
              </span>
              {editable && <LineActions line={line} onEdit={() => setEditing(line.id)} />}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function LineSection({
  kind,
  title,
  empty,
  lines,
  positionLines,
  repairOrderId,
  editable,
}: {
  kind: RoLine['kind'];
  title: string;
  empty: string;
  lines: RoLine[];
  /** Toutes les lignes de la section, pièces comprises : la nouvelle ligne vient après. */
  positionLines: RoLine[];
  repairOrderId: string | undefined;
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="col gap-1">
      <h3 className="overline">{title}</h3>
      <LineList lines={lines} empty={empty} editable={editable} />
      {editable &&
        repairOrderId &&
        (adding ? (
          <NewLineForm
            repairOrderId={repairOrderId}
            kind={kind}
            lines={positionLines}
            onDone={() => setAdding(false)}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            aria-label={`Ajouter une ligne (${SECTION_LABELS[kind]})`}
            onClick={() => setAdding(true)}
          >
            <Plus /> Ajouter une ligne
          </Button>
        ))}
    </section>
  );
}

/**
 * Travaux effectués et à prévoir (saisis par le technicien) ; les pièces ont leur propre carte.
 * `editable` : le bureau ajoute une ligne, modifie le texte d'une ligne ou la supprime (OR non facturé).
 */
export function LinesCard({
  lines: allLines,
  repairOrderId,
  editable = false,
}: {
  lines: RoLine[];
  repairOrderId?: string;
  editable?: boolean;
}) {
  const lines = allLines.filter((line) => line.line_type !== 'part');
  return (
    <section data-slot="card" className="card" aria-labelledby="ro-lines">
      <div className="card-h">
        <h2 className="h2" id="ro-lines">
          Intervention atelier
        </h2>
        <span className="muted text-[13px]">
          {editable ? 'Saisie par le technicien, modifiable par le bureau' : 'Saisie par le technicien'}
        </span>
      </div>
      <div className="card-b grid gap-7 md:grid-cols-2">
        <LineSection
          kind="done"
          title="Travaux effectués"
          empty="Aucun travail déclaré."
          lines={lines.filter((line) => line.kind === 'done')}
          positionLines={allLines.filter((line) => line.kind === 'done')}
          repairOrderId={repairOrderId}
          editable={editable}
        />
        <LineSection
          kind="planned"
          title="À prévoir (devis)"
          empty="Rien à prévoir pour l’instant."
          lines={lines.filter((line) => line.kind === 'planned')}
          positionLines={allLines.filter((line) => line.kind === 'planned')}
          repairOrderId={repairOrderId}
          editable={editable}
        />
      </div>
    </section>
  );
}
