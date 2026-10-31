import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';
import type { ServicePackage } from './lines';

export async function fetchServicePackages(): Promise<ServicePackage[]> {
  const { data, error } = await supabase
    .from('service_packages')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data;
}

export function useServicePackages() {
  return useQuery({ queryKey: ['service-packages'], queryFn: fetchServicePackages, staleTime: 5 * 60_000 });
}

export type LaborRate = Tables<'labor_rates'>;

/** Ordre des catégories dans les listes (celui des réglages). */
const CATEGORY_ORDER: LaborRate['category'][] = ['pl', 'vul', 'remorque', 'tolerie'];

export async function fetchLaborRates(): Promise<LaborRate[]> {
  const { data, error } = await supabase.from('labor_rates').select('*');
  if (error) throw error;
  return [...data].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
}

/** Taux horaires des réglages, proposés à l'ajout de main d'œuvre. */
export function useLaborRates() {
  return useQuery({ queryKey: ['labor-rates'], queryFn: fetchLaborRates });
}
