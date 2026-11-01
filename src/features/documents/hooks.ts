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

/** Taux de base d'abord (poids lourds, VUL, remorque, tôlerie), puis types ajoutés (ordre des réglages). */
export async function fetchLaborRates(): Promise<LaborRate[]> {
  const { data, error } = await supabase.from('labor_rates').select('*');
  if (error) throw error;
  return [...data].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

/** Taux horaires des réglages, proposés à l'ajout de main d'œuvre. */
export function useLaborRates() {
  return useQuery({ queryKey: ['labor-rates'], queryFn: fetchLaborRates });
}
