import { supabase } from '@/lib/supabase';
import type { Database, Tables, TablesUpdate } from '@/types/database';

export type CompanySettings = Tables<'company_settings'>;
export type LaborRate = Tables<'labor_rates'>;
export type AppSettings = Tables<'app_settings'>;
export type LaborCategory = Database['public']['Enums']['labor_category'];

export interface Settings {
  company: CompanySettings;
  laborRates: LaborRate[];
  app: AppSettings;
}

/** Taux de base d'abord (poids lourds, VUL, remorque, tôlerie), puis types ajoutés par libellé. */
export const sortLaborRates = (rates: LaborRate[]) =>
  [...rates].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

export async function fetchSettings(): Promise<Settings> {
  const [company, laborRates, app] = await Promise.all([
    supabase.from('company_settings').select('*').single(),
    supabase.from('labor_rates').select('*'),
    supabase.from('app_settings').select('*').single(),
  ]);
  if (company.error) throw company.error;
  if (laborRates.error) throw laborRates.error;
  if (app.error) throw app.error;
  return {
    company: company.data,
    laborRates: sortLaborRates(laborRates.data),
    app: app.data,
  };
}

/** Sans droit de modification, le RLS ne modifie aucune ligne sans lever d'erreur : on le signale. */
function assertUpdated<T>(result: { data: T[] | null; error: Error | null }) {
  if (result.error) throw result.error;
  if (!result.data?.length) throw new Error('Modification réservée à la direction');
}

export async function updateCompanySettings(patch: TablesUpdate<'company_settings'>) {
  assertUpdated(await supabase.from('company_settings').update(patch).eq('id', true).select('id'));
}

export async function updateLaborRates(
  rates: (Pick<LaborRate, 'id'> & Partial<Pick<LaborRate, 'label' | 'labor_line_label' | 'hourly_rate'>>)[],
) {
  for (const { id, ...patch } of rates) {
    assertUpdated(await supabase.from('labor_rates').update(patch).eq('id', id).select('id'));
  }
}

/** Type de main d'œuvre ajouté par la direction (sans catégorie : prix et libellés seulement). */
export async function addLaborRate(rate: Pick<LaborRate, 'label' | 'labor_line_label' | 'hourly_rate'>) {
  const { error } = await supabase.from('labor_rates').insert({ ...rate, category: null });
  if (error) throw error;
}

/** Type ajouté supprimé ; les taux de base (poids lourds, VUL, remorque, tôlerie) restent. */
export async function deleteLaborRate(id: string) {
  const { data, error } = await supabase.from('labor_rates').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Taux de base : il ne se supprime pas');
}

export async function updateAppSettings(patch: TablesUpdate<'app_settings'>) {
  assertUpdated(await supabase.from('app_settings').update(patch).eq('id', true).select('id'));
}
