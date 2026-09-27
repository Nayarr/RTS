import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
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
