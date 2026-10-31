import { describe, expect, it } from 'vitest';
import { OPEN_CATEGORIES, orderCategory } from './constants';

describe('catégorie d’un OR', () => {
  it('devis parti au client : « Devis envoyé » ; facturé reste « Facturé »', () => {
    const order = { technician_id: 't1', quote_sent: true };
    expect(orderCategory({ ...order, status: 'quote_pending' })).toBe('quote_sent');
    expect(orderCategory({ ...order, status: 'invoiced' })).toBe('invoiced');
    // Seulement aux étapes où l'envoi a un sens
    expect(orderCategory({ ...order, status: 'to_invoice' })).toBe('to_invoice');
    expect(orderCategory({ ...order, status: 'quote_pending', quote_sent: false })).toBe('quote_pending');
  });

  it('OR sans technicien : « Non assigné » ; technicien inconnu : assigné', () => {
    expect(orderCategory({ status: 'assigned', technician_id: null })).toBe('unassigned');
    expect(orderCategory({ status: 'assigned' })).toBe('assigned');
  });

  it('OR à traiter : pas les facturés', () => {
    expect(OPEN_CATEGORIES).toContain('quote_sent');
    expect(OPEN_CATEGORIES).not.toContain('invoiced');
  });
});
