import { supabase } from '@/lib/supabase';

/** Lien public d'un document (devis à signer, facture), ouvert par le client sans compte. */
export const publicDocumentUrl = (token: string) => `${window.location.origin}/d/${token}`;

export interface ClientContact {
  email: string | null;
  phone: string | null;
}

export async function fetchClientContact(clientId: string): Promise<ClientContact> {
  const { data, error } = await supabase.from('clients').select('email, phone').eq('id', clientId).single();
  if (error) throw error;
  return data;
}

/** Coordonnées saisies à l'envoi : gardées sur la fiche client (reprises partout ensuite). */
export async function updateClientContact(clientId: string, contact: ClientContact) {
  const { error } = await supabase.from('clients').update(contact).eq('id', clientId);
  if (error) throw error;
}
