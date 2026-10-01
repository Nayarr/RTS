import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { PdfPreviewDialog, type PdfFile } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { cn } from '@/lib/utils';
import { DIRECTION_TOPICS, FAQ, OFFICE_TOPICS, TECHNICIAN_TOPICS, type HelpTopic } from './help-content';
import { buildTechnicianMemoPdf } from './memo-pdf';

interface TopicGroup {
  title: string;
  audience: string;
  topics: HelpTopic[];
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
  const groups: TopicGroup[] = [
    { title: 'Pour les techniciens', audience: 'Techniciens', topics: TECHNICIAN_TOPICS },
    ...(role && role !== 'technician'
      ? [
          {
            title: 'Pour la réception et la direction',
            audience: 'Réception · Direction',
            topics: OFFICE_TOPICS,
          },
        ]
      : []),
    ...(role === 'direction'
      ? [{ title: 'Pour la direction', audience: 'Direction', topics: DIRECTION_TOPICS }]
      : []),
  ];
  const [selected, setSelected] = useState<string | null>(null);
  const group = groups.find((item) => item.topics.some((topic) => topic.title === selected)) ?? groups[0];
  const topic = group?.topics.find((item) => item.title === selected) ?? group?.topics[0];

  const open = (title: string) => {
    setSelected(title);
    // Écran étroit : les explications sont sous la liste des sujets.
    if (window.matchMedia?.('(max-width: 1023px)').matches) {
      document.getElementById('help-topic')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Aide' }]}
        title="Aide"
        actions={
          <>
            <span className="sub hidden md:inline">Clique sur un sujet pour afficher les explications</span>
            <Button variant="outline" disabled={print.isPending} onClick={() => print.mutate()}>
              <Printer /> Fiche mémo technicien (PDF)
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <nav data-slot="card" className="card p-2.5" aria-label="Sujets de l’aide">
          {groups.map((item, index) => (
            <section key={item.title} aria-label={item.title}>
              <span className={cn('block px-3 pb-1.5 overline', index === 0 ? 'pt-2' : 'pt-3.5')}>
                {item.title}
              </span>
              {item.topics.map((entry) => (
                <button
                  key={entry.title}
                  type="button"
                  className={cn('topic', entry === topic && 'on')}
                  aria-current={entry === topic ? 'true' : undefined}
                  onClick={() => open(entry.title)}
                >
                  {entry.title}
                </button>
              ))}
            </section>
          ))}
        </nav>

        {topic && group && (
          <article
            id="help-topic"
            data-slot="card"
            className="card scroll-mt-24"
            aria-labelledby="help-topic-title"
          >
            <div className="card-h flex-wrap">
              <h2 className="h2 text-2xl!" id="help-topic-title">
                {topic.title}
              </h2>
              <span className="tag">{group.audience}</span>
            </div>
            <div className="card-b">
              <ol className="col m-0 list-decimal gap-2 pl-5 text-[14.5px] leading-relaxed">
                {topic.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          </article>
        )}

        <section
          data-slot="card"
          className="card lg:col-start-2 2xl:col-start-auto"
          aria-labelledby="help-faq-title"
        >
          <div className="card-h">
            <h2 className="h2" id="help-faq-title">
              Questions fréquentes
            </h2>
          </div>
          {FAQ.map((entry) => (
            <details key={entry.question} className="faq">
              <summary>
                {entry.question}
                <ChevronDown className="i s text-muted-foreground" />
              </summary>
              <p>{entry.answer}</p>
            </details>
          ))}
        </section>
      </div>

      <p className="hint">Une question non couverte ici ? Contacte la direction de l’atelier.</p>
      {memo && <PdfPreviewDialog file={memo} onClose={() => setMemo(null)} />}
    </>
  );
}
