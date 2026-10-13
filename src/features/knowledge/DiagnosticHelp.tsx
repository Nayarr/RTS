import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Mic, Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDictation } from '@/lib/use-dictation';
import { askDiagnostic } from './api';

/**
 * Aide au diagnostic (fiche OR du mécanicien) : symptômes dictés ou tapés, pistes proposées à
 * partir de l'historique du véhicule et de la documentation technique, sources citées.
 */
export function DiagnosticHelp({ repairOrderId }: { repairOrderId: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const ask = useMutation({
    mutationFn: () => askDiagnostic(repairOrderId, question),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Aide au diagnostic indisponible'),
  });
  const dictation = useDictation({
    onFinal: (text) => setQuestion((current) => (current ? `${current} ${text}` : text)),
    onError: (message) => toast.error(message),
    keyboard: 'décris les symptômes au clavier',
    beep: true,
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Sparkles /> Aide au diagnostic
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Aide au diagnostic</DialogTitle>
            <DialogDescription>
              Décris la panne : l’assistant regarde l’historique du véhicule et la documentation technique,
              puis propose des pistes à vérifier.
            </DialogDescription>
          </DialogHeader>
          <div className="field">
            <Label htmlFor="diagnostic-question">Symptômes</Label>
            <Textarea
              id="diagnostic-question"
              rows={3}
              placeholder="Ex : voyant de pression d’huile qui s’allume au ralenti, moteur chaud"
              value={dictation.listening && dictation.interim ? `${question} ${dictation.interim}` : question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </div>
          <div className="row flex-wrap gap-2">
            {dictation.supported && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
              >
                {dictation.listening ? <Square /> : <Mic />}
                {dictation.listening ? (dictation.ready ? 'J’écoute…' : 'Micro…') : 'Parler'}
              </Button>
            )}
          </div>
          {ask.data && (
            <section
              aria-label="Pistes de diagnostic"
              className="col gap-2.5 rounded-xl border bg-muted/40 p-3.5"
            >
              <p className="text-sm whitespace-pre-line">{ask.data.answer}</p>
              {ask.data.sources.length > 0 && (
                <ul className="hint col gap-0.5" aria-label="Sources">
                  {ask.data.sources.map((source) => (
                    <li key={source.n}>
                      [{source.n}] {source.title}, page {source.page}
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint">Pistes à vérifier : le diagnostic reste celui du mécanicien.</p>
            </section>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <Button disabled={question.trim().length < 3 || ask.isPending} onClick={() => ask.mutate()}>
              <Sparkles />{' '}
              {ask.isPending ? 'Recherche des pistes…' : ask.data ? 'Redemander' : 'Demander des pistes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
