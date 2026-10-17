import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/features/customers/api';
import { newClientFromForm, type NewClientValues } from '@/features/customers/domain';
import { useDebounced } from '@/lib/use-debounced';
import { findClientByName } from './api';
import { normalizeKey } from './constants';
import { useClientByName, useClientSuggestions } from './hooks';
import { orNewClientDefaults, orNewClientSchema } from './schemas';

/** Résultat de la vérification du client avant l'enregistrement. */
export type ClientCheck =
  /** Pas de client saisi, ou client déjà en base : rien à créer. */
  | { ok: true; client: null }
  /** Nouveau client, fiche complète : à créer avec `createNewClient`. */
  | { ok: true; client: NewClientValues }
  /** Nouveau client, fiche affichée ou incomplète : l'enregistrement attend. */
  | { ok: false };

/**
 * Saisie du client, la même partout (OR, rendez-vous, devis, contrat) : les clients connus
 * sont proposés pendant la frappe ; un client inconnu fait apparaître sa fiche complète
 * (NewClientFields), créée juste avant l'enregistrement.
 */
export function useClientEntry(clientName: string, { label }: { label: string }) {
  const queryClient = useQueryClient();
  const suggestions = useClientSuggestions(clientName).data ?? [];
  // Client pas encore en base (vérifié après une pause de frappe) : sa fiche se remplit ici.
  const lookup = useClientByName(useDebounced(clientName, 500));
  // Nom vérifié à l'enregistrement (saisie trop rapide pour la vérification ci-dessus).
  const [checkedNew, setCheckedNew] = useState<string | null>(null);
  const isNewClient =
    (clientName.trim().length >= 2 && lookup.isSuccess && lookup.data === null) ||
    (checkedNew !== null && checkedNew === normalizeKey(clientName));
  const form = useForm<NewClientValues>({
    resolver: zodResolver(orNewClientSchema),
    defaultValues: orNewClientDefaults('pro', ''),
  });
  // Pro / particulier : identité reprise du nom saisi, coordonnées gardées.
  const changeKind = (kind: NewClientValues['kind']) => {
    const { phone, email, billing_address } = form.getValues();
    form.reset({ ...orNewClientDefaults(kind, clientName), phone, email, billing_address });
  };

  /** À appeler avant l'enregistrement : vérifie le client et, s'il est nouveau, sa fiche. */
  const check = async (name: string): Promise<ClientCheck> => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: true, client: null };
    if (!isNewClient) {
      const key = normalizeKey(trimmed);
      const existing = await queryClient.fetchQuery({
        queryKey: ['clients', 'by-name', key],
        queryFn: () => findClientByName(trimmed),
        staleTime: 30_000,
      });
      if (existing !== null) return { ok: true, client: null };
      setCheckedNew(key);
      toast.info(`Nouveau client : complète sa fiche pour ${label}`);
      return { ok: false };
    }
    form.setValue('name', trimmed);
    if (!(await form.trigger())) return { ok: false };
    return { ok: true, client: form.getValues() };
  };

  /** Crée la fiche du nouveau client ; renvoie le nom sous lequel le rattacher. */
  const createNewClient = async (client: NewClientValues): Promise<string> => {
    const fields = newClientFromForm(client);
    await createClient(fields);
    await queryClient.invalidateQueries({ queryKey: ['clients'] });
    return fields.name ?? client.name;
  };

  /** Vérifie puis crée au besoin : nom du client à enregistrer, ou null si la fiche attend. */
  const resolve = async (name: string): Promise<string | null> => {
    const result = await check(name);
    if (!result.ok) return null;
    return result.client ? createNewClient(result.client) : name.trim();
  };

  return { suggestions, isNewClient, form, changeKind, check, createNewClient, resolve };
}
