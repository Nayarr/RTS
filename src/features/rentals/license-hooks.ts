import { useQuery } from '@tanstack/react-query';
import { fetchClientLicenses } from './license-api';

export const licensesKey = (clientId: string) => ['driving-licenses', clientId] as const;

export const useClientLicenses = (clientId: string) =>
  useQuery({ queryKey: licensesKey(clientId), queryFn: () => fetchClientLicenses(clientId) });
