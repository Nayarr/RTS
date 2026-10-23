import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Volume2 } from 'lucide-react';
import { Controller, type Control, type UseFormRegister } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AZURE_VOICES, azureAudio } from '@/features/assistant/azure-voice';
import { supabase } from '@/lib/supabase';
import type { WorkshopValues } from './schemas';

const TRIAL = 'Bonjour, voici la voix qui lira le point du jour et les réponses de l’agent.';

const NUMBER = new Intl.NumberFormat('fr-FR');

/** Caractères lus par Azure ce mois-ci (heure de Paris). */
async function fetchMonthUsage(): Promise<number> {
  const month = `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()).slice(0, 7)}-01`;
  const { data, error } = await supabase
    .from('tts_usage')
    .select('characters')
    .eq('month', month)
    .maybeSingle();
  if (error) throw error;
  return data?.characters ?? 0;
}

/** Voix de l'Agent Direction : navigateur (gratuite) ou Azure (naturelle, 500 000 caractères par mois). */
export function VoiceSettings({
  control,
  register,
  provider,
  voice,
  limit,
  error,
}: {
  control: Control<WorkshopValues>;
  register: UseFormRegister<WorkshopValues>;
  provider: WorkshopValues['tts_provider'];
  voice: WorkshopValues['tts_voice'];
  limit: number;
  error?: string | undefined;
}) {
  const usage = useQuery({ queryKey: ['settings', 'tts-usage'], queryFn: fetchMonthUsage });
  const [trial, setTrial] = useState<{ pending: boolean; message?: string }>({ pending: false });

  const listen = async () => {
    setTrial({ pending: true });
    try {
      const audio = new Audio(await azureAudio(TRIAL, voice));
      await audio.play();
      setTrial({ pending: false });
      void usage.refetch();
    } catch (failure) {
      setTrial({
        pending: false,
        message: failure instanceof Error ? failure.message : 'Essai impossible',
      });
    }
  };

  return (
    <fieldset className="col gap-3 rounded-xl border px-3.5 py-3">
      <legend className="px-1 text-sm font-bold">Voix de l’Agent</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name="tts_provider"
          render={({ field }) => (
            <div className="field">
              <Label htmlFor="tts_provider">Voix</Label>
              <select
                id="tts_provider"
                className="inp"
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
              >
                <option value="browser">Voix du navigateur (gratuite, sur l’appareil)</option>
                <option value="azure">Voix naturelle Azure</option>
              </select>
            </div>
          )}
        />
        <div className="field">
          <Label htmlFor="tts_voice">Voix Azure</Label>
          <select id="tts_voice" className="inp" {...register('tts_voice')}>
            {AZURE_VOICES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2">
        <FormField
          id="tts_monthly_limit"
          label="Plafond du mois (caractères)"
          type="number"
          inputMode="numeric"
          className="num"
          hint="Niveau gratuit d’Azure : 500 000. Au-delà du plafond, voix du navigateur jusqu’au mois suivant."
          error={error}
          {...register('tts_monthly_limit', { valueAsNumber: true })}
        />
        <div className="col gap-1.5">
          <span className="hint" role="status">
            {usage.isSuccess
              ? `Ce mois-ci : ${NUMBER.format(usage.data)} sur ${NUMBER.format(limit || 0)} caractères`
              : 'Ce mois-ci : …'}
          </span>
          <Button type="button" variant="outline" disabled={trial.pending} onClick={() => void listen()}>
            <Volume2 /> Écouter un essai
          </Button>
        </div>
      </div>
      {trial.message && <p className="err">{trial.message}</p>}
      {provider === 'azure' && (
        <p className="hint">
          Sans clé Azure, plafond atteint ou réseau coupé, l’agent lit avec la voix du navigateur.
        </p>
      )}
    </fieldset>
  );
}
