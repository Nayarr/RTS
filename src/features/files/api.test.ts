import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeFunction } from '@/lib/functions';
import { fetchFileUrls, uploadFile } from './api';

vi.mock('@/lib/functions', () => ({ invokeFunction: vi.fn() }));

const ticket = {
  file_id: 'f1',
  upload_url: 'https://r2.example/rts-atelier/ro_photo/f1.jpg?X-Amz-Signature=abc',
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
};

afterEach(() => vi.unstubAllGlobals());

describe('uploadFile', () => {
  it('réserve, envoie directement dans R2 puis confirme', async () => {
    vi.mocked(invokeFunction).mockResolvedValueOnce(ticket).mockResolvedValueOnce({ file_id: 'f1' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const photo = new File(['abc'], 'frein.jpg', { type: 'image/jpeg' });

    expect(await uploadFile(photo, { category: 'ro_photo' })).toBe('f1');
    expect(invokeFunction).toHaveBeenNthCalledWith(1, 'files', {
      action: 'upload',
      category: 'ro_photo',
      mime_type: 'image/jpeg',
      size_bytes: 3,
      original_name: 'frein.jpg',
    });
    expect(fetchMock).toHaveBeenCalledWith(ticket.upload_url, {
      method: 'PUT',
      headers: ticket.headers,
      body: photo,
    });
    expect(invokeFunction).toHaveBeenNthCalledWith(2, 'files', { action: 'confirm', file_id: 'f1' });
  });

  it('ne confirme pas si l’envoi vers R2 échoue', async () => {
    vi.mocked(invokeFunction).mockResolvedValueOnce(ticket);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(
      uploadFile(new Blob(['abc'], { type: 'image/jpeg' }), { category: 'ro_photo' }),
    ).rejects.toThrow('Envoi du fichier impossible');
    expect(invokeFunction).toHaveBeenCalledOnce();
  });
});

describe('fetchFileUrls', () => {
  it('n’appelle pas la fonction sans fichier', async () => {
    expect(await fetchFileUrls([])).toEqual({});
    expect(invokeFunction).not.toHaveBeenCalled();
  });

  it('demande les URL de lecture par lot', async () => {
    vi.mocked(invokeFunction).mockResolvedValue({ urls: { f1: 'https://r2.example/f1' } });
    expect(await fetchFileUrls(['f1', 'f2'], 'attachment')).toEqual({ f1: 'https://r2.example/f1' });
    expect(invokeFunction).toHaveBeenCalledWith('files', {
      action: 'download',
      file_ids: ['f1', 'f2'],
      disposition: 'attachment',
    });
  });
});
