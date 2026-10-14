import { uploadFile } from '@/features/files/api';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type KnowledgeDocument = Pick<
  Tables<'knowledge_documents'>,
  'id' | 'title' | 'status' | 'pages' | 'chunks' | 'error' | 'created_at'
>;

/** Documentation technique consultée par l'aide au diagnostic. */
export async function fetchDocuments(): Promise<KnowledgeDocument[]> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('id, title, status, pages, chunks, error, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** PDF envoyé, noté, puis découpé en passages par la fonction knowledge-ingest. */
export async function addDocument(file: File, title: string) {
  const fileId = await uploadFile(file, { category: 'document_pdf' });
  const { data, error } = await supabase
    .from('knowledge_documents')
    .insert({ title: title.trim() || file.name.replace(/\.pdf$/i, ''), file_id: fileId })
    .select('id')
    .single();
  if (error) throw error;
  return invokeFunction<{ pages: number; chunks: number }>('knowledge-ingest', { document_id: data.id });
}

export async function deleteDocument(id: string) {
  const { error } = await supabase.from('knowledge_documents').delete().eq('id', id);
  if (error) throw error;
}

/** Aide au diagnostic depuis la fiche OR : pistes et sources citées. */
export interface DiagnosticAnswer {
  answer: string;
  sources: { n: number; title: string; page: number }[];
}

export function askDiagnostic(repairOrderId: string, question: string) {
  return invokeFunction<DiagnosticAnswer>('diagnostic', { repair_order_id: repairOrderId, question });
}
