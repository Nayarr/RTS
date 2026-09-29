import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { PdfPreviewDialog, type PdfFile } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { DIRECTION_TOPICS, FAQ, OFFICE_TOPICS, TECHNICIAN_TOPICS, type HelpTopic } from './help-content';
import { buildTechnicianMemoPdf } from './memo-pdf';

function Topic({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 transition group-open:rotate-90" />
        {title}
      </summary>
      <div className="px-3 pb-3 pl-9 text-sm">{children}</div>
    </details>
  );
}

function TopicSection({ title, topics }: { title: string; topics: HelpTopic[] }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {topics.map((topic) => (
        <Topic key={topic.title} title={topic.title}>
          <ul className="list-disc space-y-1 pl-4">
            {topic.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Topic>
      ))}
    </section>
  );
}

/** Aide intégrée : sujets selon le rôle, questions fréquentes, mémo technicien à imprimer. */
export function HelpPage() {
  const { data: profile } = useProfile();
  const [memo, setMemo] = useState<PdfFile | null>(null);
  const print = useMutation({
    mutationFn: async () => {
      const { settings, logo } = await loadPdfContext();
      const { doc, fileName } = await buildTechnicianMemoPdf(settings.company, logo);
      setMemo({ blob: doc.output('blob'), fileName });
    },
    onError: () => toast.error('Mémo impossible à générer'),
  });
  const role = profile?.role;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Aide</h1>
          <p className="text-muted-foreground">Clique sur un sujet pour afficher les explications.</p>
        </div>
        <Button variant="outline" disabled={print.isPending} onClick={() => print.mutate()}>
          <Printer /> Fiche mémo technicien (PDF)
        </Button>
      </div>

      <TopicSection title="Pour les techniciens" topics={TECHNICIAN_TOPICS} />
      {role && role !== 'technician' && (
        <TopicSection title="Pour la réception et la direction" topics={OFFICE_TOPICS} />
      )}
      {role === 'direction' && <TopicSection title="Pour la direction" topics={DIRECTION_TOPICS} />}

      <section aria-label="Questions fréquentes" className="space-y-2">
        <h2 className="text-lg font-bold">Questions fréquentes</h2>
        {FAQ.map((entry) => (
          <Topic key={entry.question} title={entry.question}>
            <p>{entry.answer}</p>
          </Topic>
        ))}
      </section>

      <p className="text-sm text-muted-foreground">
        Une question non couverte ici ? Contacte la direction de l’atelier.
      </p>
      {memo && <PdfPreviewDialog file={memo} onClose={() => setMemo(null)} />}
    </div>
  );
}
