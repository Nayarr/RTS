import { fetchFileUrls } from '@/features/files/api';
import { fetchSettings, type Settings } from '@/features/settings/api';
import { imageToDataUrl } from '@/lib/pdf';

/** Logo des réglages (stocké dans R2), sinon l'icône de l'appli. */
async function companyLogo(logoFileId: string | null): Promise<string | null> {
  if (logoFileId) {
    const noUrls: Record<string, string> = {};
    const urls = await fetchFileUrls([logoFileId]).catch(() => noUrls);
    const url = urls[logoFileId];
    const logo = url ? await imageToDataUrl(url) : null;
    if (logo) return logo;
  }
  return imageToDataUrl('/icons/icon-192.png');
}

/** Réglages et logo nécessaires à l'en-tête des documents PDF. */
export async function loadPdfContext(): Promise<{ settings: Settings; logo: string | null }> {
  const settings = await fetchSettings();
  return { settings, logo: await companyLogo(settings.company.logo_file_id) };
}
