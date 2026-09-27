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

const LABOR_ORDER: LaborCategory[] = ['pl', 'vul', 'remorque', 'tolerie'];

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
    laborRates: [...laborRates.data].sort(
      (a, b) => LABOR_ORDER.indexOf(a.category) - LABOR_ORDER.indexOf(b.category),
    ),
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
  rates: (Pick<LaborRate, 'category'> &
    Partial<Pick<LaborRate, 'label' | 'labor_line_label' | 'hourly_rate'>>)[],
) {
  for (const { category, ...patch } of rates) {
    assertUpdated(
      await supabase.from('labor_rates').update(patch).eq('category', category).select('category'),
    );
  }
}

export async function updateAppSettings(patch: TablesUpdate<'app_settings'>) {
  assertUpdated(await supabase.from('app_settings').update(patch).eq('id', true).select('id'));
}
