import { describe, expect, it } from 'vitest';
import { compressImage, fitWithin } from './image';

describe('fitWithin', () => {
  it('réduit une photo paysage ou portrait en gardant les proportions', () => {
    expect(fitWithin(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin(3000, 4000, 1920)).toEqual({ width: 1440, height: 1920 });
  });

  it('n’agrandit jamais une petite image', () => {
    expect(fitWithin(800, 600, 1920)).toEqual({ width: 800, height: 600 });
  });
});

describe('compressImage', () => {
  it('laisse passer un fichier qui n’est pas une photo', async () => {
    const pdf = new File([new Uint8Array(1024 * 1024)], 'devis.pdf', { type: 'application/pdf' });
    expect(await compressImage(pdf)).toBe(pdf);
  });

  it('laisse passer une photo déjà légère', async () => {
    const photo = new File([new Uint8Array(10 * 1024)], 'petite.jpg', { type: 'image/jpeg' });
    expect(await compressImage(photo)).toBe(photo);
  });
});
