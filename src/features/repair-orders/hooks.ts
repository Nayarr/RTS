import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchActiveTechnicians,
  fetchRepairOrder,
  fetchRepairOrderEvents,
  fetchRepairOrders,
  findVehicleByPlate,
  searchClients,
} from './api';
import { fetchSupplies } from './supplies-api';

export const repairOrdersKey = ['repair-orders'] as const;
export const repairOrderKey = (id: string) => ['repair-orders', id] as const;

/** Rafraîchissement régulier : l'atelier modifie les OR pendant que le bureau les consulte. */
const LIVE = { refetchInterval: 30_000, refetchOnWindowFocus: true } as const;

export function useRepairOrders() {
  return useQuery({ queryKey: repairOrdersKey, queryFn: fetchRepairOrders, ...LIVE });
}

export function useRepairOrder(id: string) {
  return useQuery({ queryKey: repairOrderKey(id), queryFn: () => fetchRepairOrder(id), ...LIVE });
}

/** Pièces (fournisseurs), sous-traitance et consommables : rechargés avec la fiche. */
export function useRepairOrderSupplies(id: string) {
  return useQuery({
    queryKey: [...repairOrderKey(id), 'supplies'],
    queryFn: () => fetchSupplies(id),
    ...LIVE,
  });
}

export function useRepairOrderEvents(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...repairOrderKey(id), 'events'],
    queryFn: () => fetchRepairOrderEvents(id),
    enabled,
  });
}

export function useActiveTechnicians() {
  return useQuery({
    queryKey: ['technicians', 'active'],
    queryFn: fetchActiveTechnicians,
    staleTime: 5 * 60_000,
  });
}

export function useClientSuggestions(query: string) {
  return useQuery({
    queryKey: ['clients', 'search', query.trim().toLowerCase()],
    queryFn: () => searchClients(query),
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useKnownVehicle(plate: string) {
  return useQuery({
    queryKey: ['vehicles', 'by-plate', plate],
    queryFn: () => findVehicleByPlate(plate),
    enabled: plate.replace(/[^A-Za-z0-9]/g, '').length >= 4,
    staleTime: 30_000,
  });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/**
 * Mutation sur un OR : notification (sauf `successMessage` null) puis rechargement
 * de la liste et de la fiche.
 */
export function useRepairOrderMutation<TArgs, TData = unknown>(
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage: string | ((args: TArgs) => string) | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (_data, args) => {
      if (successMessage !== null) {
        toast.success(typeof successMessage === 'function' ? successMessage(args) : successMessage);
      }
      await queryClient.invalidateQueries({ queryKey: repairOrdersKey });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
