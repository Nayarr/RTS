import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { addDocument, deleteDocument, fetchDocuments, type KnowledgeDocument } from './api';

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'En cours de lecture', tone: 's-blue' },
  ready: { label: 'Prêt', tone: 's-ok' },
  failed: { label: 'Illisible', tone: 's-bad' },
};

const statusOf = (document: KnowledgeDocument) => STATUS[document.status] ?? STATUS.pending!;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Document non ajouté');

/**
 * Documentation technique (direction) : manuels et notes en PDF que l'aide au diagnostic
 * consulte. Chaque PDF est découpé en passages, cherchés à chaque question du mécanicien.
 */
export function KnowledgePage() {
  const queryClient = useQueryClient();
  const documents = useQuery({ queryKey: ['knowledge'], queryFn: fetchDocuments });
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [deleting, setDeleting] = useState<KnowledgeDocument | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['knowledge'] });

  const add = useMutation({
    mutationFn: (file: File) => addDocument(file, title),
    onSuccess: ({ pages, chunks }) => {
      toast.success(`Document ajouté : ${pages} pages, ${chunks} passages`);
      setTitle('');
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (document: KnowledgeDocument) => deleteDocument(document.id),
    onSuccess: () => setDeleting(null),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Atelier' }, { label: 'Documentation technique' }]}
        title="Documentation technique"
      />

      <section data-slot="card" className="card" aria-labelledby="knowledge-add">
        <div className="card-h">
          <h2 className="h2" id="knowledge-add">
            Ajouter un document
          </h2>
        </div>
        <div className="card-b col gap-3">
          <p className="hint">
            Manuels d’atelier, notes techniques, fiches de diagnostic en PDF (20 Mo au plus, avec du texte :
            un document scanné doit d’abord passer en reconnaissance de texte). L’aide au diagnostic y cherche
            les passages utiles et les cite au mécanicien.
          </p>
          <div className="row flex-wrap items-end gap-3">
            <div className="grow">
              <FormField
                id="knowledge-title"
                label="Titre (facultatif)"
                placeholder="Ex : Manuel d’atelier Volvo FH"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <input
              ref={input}
              type="file"
              accept="application/pdf"
              className="hidden"
              aria-label="Fichier PDF"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) add.mutate(file);
              }}
            />
            <Button disabled={add.isPending} onClick={() => input.current?.click()}>
              <FileUp /> {add.isPending ? 'Lecture du PDF…' : 'Choisir un PDF'}
            </Button>
          </div>
        </div>
      </section>

      {documents.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {documents.isError && <p className="text-destructive">Impossible de charger la documentation.</p>}
      {documents.data?.length === 0 && (
        <p className="empty">
          Aucun document : l’aide au diagnostic s’appuie seulement sur l’historique du véhicule.
        </p>
      )}
      {documents.data && documents.data.length > 0 && (
        <div className="card tbl-wrap overflow-x-auto!">
          <table className="tbl" aria-label="Documents">
            <thead>
              <tr>
                <th>Document</th>
                <th>État</th>
                <th className="r">Pages</th>
                <th className="r">Passages</th>
                <th className="w-[60px]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.data.map((document) => (
                <tr key={document.id} aria-label={document.title}>
                  <td className="b whitespace-normal">
                    {document.title}
                    {document.error && (
                      <span className="muted block text-xs font-normal">{document.error}</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${statusOf(document).tone}`}>{statusOf(document).label}</span>
                  </td>
                  <td className="r num">{document.pages ?? '-'}</td>
                  <td className="r num">{document.chunks}</td>
                  <td>
                    <button
                      type="button"
                      className="ibtn sm ghost text-destructive"
                      aria-label={`Supprimer ${document.title}`}
                      onClick={() => setDeleting(document)}
                    >
                      <Trash2 className="i s" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Retirer ${deleting?.title ?? ''} de la documentation ?`}
        description="L’aide au diagnostic ne le consultera plus."
        confirmLabel="Retirer"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
