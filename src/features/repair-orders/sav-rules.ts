import type { RepairOrderOverview } from './api';

/** Adresse de création d'un OR de SAV pour cet OR d'origine. */
export const savPath = (originId: string) => `/or/nouveau?sav=${originId}`;

/** OR pouvant donner lieu à un SAV : travail fini (à facturer ou facturé). */
export const canOpenSav = (status: RepairOrderOverview['status']) =>
  status === 'work_done' || status === 'quote_pending' || status === 'to_invoice' || status === 'invoiced';
