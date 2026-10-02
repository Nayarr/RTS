import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

export type SignatureChannel = 'kiosk' | 'email';
export type SignatureRequestStatus = 'pending' | 'signed' | 'cancelled' | 'expired';

/** Demande de signature d'un OR (« expired » : pas signée à temps). */
export interface SignatureRequest {
  id: string;
  channel: SignatureChannel;
  status: SignatureRequestStatus;
  /** Lien envoyé au client absent (e-mail). */
  token: string | null;
  expires_at: string;
  /** Temps restant calculé par le serveur (pas d'écart d'horloge avec la borne). */
  seconds_left: number;
  signer_name: string | null;
  signed_at: string | null;
  created_at: string;
}

/** Demande affichée sur la borne : l'OR à signer. */
export interface KioskSignatureRequest extends SignatureRequest {
  number: string;
  vehicle_plate: string | null;
  client_name: string | null;
  requested_work: string;
}

export const signatureRequestKey = (repairOrderId: string) => ['signature-request', repairOrderId] as const;
export const kioskSignatureKey = ['kiosk', 'pending-signature'] as const;

export async function requestSignature(repairOrderId: string, channel: SignatureChannel) {
  const { data, error } = await supabase.rpc('request_repair_order_signature', {
    p_repair_order_id: repairOrderId,
    p_channel: channel,
  });
  if (error) throw error;
  return data as unknown as SignatureRequest;
}

export async function cancelSignatureRequest(requestId: string) {
  const { error } = await supabase.rpc('cancel_signature_request', { p_request_id: requestId });
  if (error) throw error;
}

/** Dernière demande de l'OR, ou null. */
export async function fetchSignatureRequest(repairOrderId: string) {
  const { data, error } = await supabase.rpc('repair_order_signature_request', {
    p_repair_order_id: repairOrderId,
  });
  if (error) throw error;
  return (data as unknown as SignatureRequest | null) ?? null;
}

/** Borne : demande en cours à afficher, ou null. */
export async function fetchKioskPendingSignature() {
  const { data, error } = await supabase.rpc('kiosk_pending_signature');
  if (error) throw error;
  return (data as unknown as KioskSignatureRequest | null) ?? null;
}

export async function kioskSign(requestId: string, signerName: string, signatureFileId: string) {
  const { error } = await supabase.rpc('kiosk_sign_repair_order', {
    p_request_id: requestId,
    p_signer_name: signerName,
    p_signature_file_id: signatureFileId,
  });
  if (error) throw error;
}

/** Lien e-mail : le client absent signe en ligne (page publique, sans compte). */
export async function signRepairOrderOnline(body: { token: string; signer_name: string; signature: string }) {
  return invokeFunction<{ status: 'signed' }>('ro-signature', body);
}
