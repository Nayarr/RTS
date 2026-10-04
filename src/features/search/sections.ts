import { QUOTE_STATUS_META } from '@/features/quotes/domain';
import { formatDate, STATUS_META, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { formatEuro } from '@/lib/numbers';
import type { SearchResults } from './api';

interface ResultItem {
  key: string;
  to: string;
  title: string;
  detail: string;
}

/** Résultats à plat, dans l'ordre d'affichage (Entrée ouvre le premier). */
export function searchSections(results: SearchResults): { title: string; items: ResultItem[] }[] {
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
  return [
    {
      title: 'Ordres de réparation',
      items: results.repair_orders.map((ro) => ({
        key: `ro-${ro.id}`,
        to: `/or/${ro.id}`,
        title: `${ro.number} · ${ro.plate}`,
        detail: join(ro.client_name, STATUS_META[ro.status].label, formatDate(ro.created_at)),
      })),
    },
    {
      title: 'Clients',
      items: results.clients.map((client) => ({
        key: `client-${client.id}`,
        to: `/clients/${client.id}`,
        title: client.name,
        detail: join(client.phone, client.email),
      })),
    },
    {
      title: 'Véhicules',
      items: results.vehicles.map((vehicle) => ({
        key: `vehicle-${vehicle.id}`,
        to: `/vehicules/${vehicle.id}`,
        title: vehicle.plate,
        detail: join(
          VEHICLE_TYPES[vehicle.vehicle_type],
          [vehicle.brand, vehicle.model].filter(Boolean).join(' '),
          vehicle.client_name,
        ),
      })),
    },
    {
      title: 'Devis',
      items: results.quotes.map((quote) => ({
        key: `quote-${quote.id}`,
        to: `/devis/${quote.id}`,
        title: join(quote.number ?? 'Devis sans numéro', quote.plate),
        detail: join(quote.client_name, QUOTE_STATUS_META[quote.status].label, formatDate(quote.created_at)),
      })),
    },
    {
      title: 'Factures',
      items: results.invoices.map((invoice) => ({
        key: `invoice-${invoice.id}`,
        to: `/factures/${invoice.id}`,
        title: join(invoice.number ?? 'Brouillon', invoice.vehicle_label),
        detail: join(
          invoice.client_name,
          invoice.status === 'draft' ? 'Brouillon' : formatDate(invoice.issued_at),
          invoice.total_ttc !== null ? `${formatEuro(invoice.total_ttc)} TTC` : null,
        ),
      })),
    },
  ].filter((section) => section.items.length > 0);
}
