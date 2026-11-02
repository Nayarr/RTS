import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Ce qu'une ligne déplaçable reçoit : sa référence, son déplacement et la poignée à saisir. */
export interface LineDrag {
  ref: (element: HTMLElement | null) => void;
  style: CSSProperties;
  handle: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners };
  dragging: boolean;
}

function SortableItem({ id, children }: { id: string; children: (drag: LineDrag) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return children({
    ref: setNodeRef,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      position: 'relative',
      zIndex: isDragging ? 1 : undefined,
    },
    handle: { attributes, listeners },
    dragging: isDragging,
  });
}

/** Annonces du lecteur d'écran en français (rang de la ligne dans la liste). */
function announcements(rank: (id: string | number) => number): Announcements {
  return {
    onDragStart: ({ active }) => `Ligne saisie, rang ${rank(active.id)}.`,
    onDragOver: ({ over }) => (over ? `Ligne au rang ${rank(over.id)}.` : undefined),
    onDragEnd: ({ over }) => (over ? `Ligne déposée au rang ${rank(over.id)}.` : 'Ligne déposée.'),
    onDragCancel: () => 'Déplacement annulé, la ligne reprend sa place.',
  };
}

/**
 * Lignes d'un devis ou d'une facture réordonnables par glisser-déposer (souris, doigt ou clavier :
 * Espace sur la poignée, flèches, Espace). Le nouvel ordre s'affiche tout de suite, puis est enregistré.
 */
export function SortableLines<T extends { id: string }>({
  lines,
  onReorder,
  children,
}: {
  lines: T[];
  onReorder: (ids: string[]) => void;
  children: (line: T, drag: LineDrag) => ReactNode;
}) {
  // Ordre déplacé en attente de la relecture du document (vidé quand les lignes changent)
  const [moved, setMoved] = useState<{ source: T[]; ids: string[] } | null>(null);
  const ids = moved?.source === lines ? moved.ids : lines.map((line) => line.id);
  const byId = new Map(lines.map((line) => [line.id, line]));
  const ordered = ids.flatMap((id) => byId.get(id) ?? []);

  const sensors = useSensors(
    // Petit seuil : un simple appui sur la poignée ne déplace rien
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setMoved({ source: lines, ids: next });
    onReorder(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: announcements((id) => ids.indexOf(String(id)) + 1),
        screenReaderInstructions: {
          draggable:
            'Pour déplacer la ligne, appuie sur Espace, puis sur les flèches haut et bas, et de nouveau sur Espace pour la déposer. Échap annule.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul>
          {ordered.map((line) => (
            <SortableItem key={line.id} id={line.id}>
              {(drag) => children(line, drag)}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
