import type { Locator, Page } from '@playwright/test';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Barre latérale du bureau : fixe sur grand écran, dans le tiroir « Menu » sur téléphone
 * (le tiroir est ouvert au besoin).
 */
export async function sideNav(page: Page): Promise<Locator> {
  const side = page.locator('aside.side').filter({ visible: true });
  if ((page.viewportSize()?.width ?? 0) < 1024 && (await side.count()) === 0) {
    await page.getByRole('button', { name: 'Menu' }).click();
  }
  return side;
}

/** Ouvre un écran depuis la barre latérale : `group` = groupe repliable (« Facturation »…), ou null. */
export async function goTo(page: Page, group: string | null, item: string) {
  const side = await sideNav(page);
  if (group) {
    const toggle = side.getByRole('button', { name: group, exact: true });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  // Le nom du lien peut être suivi d'un compteur (« Devis 3 »).
  await side.getByRole('link', { name: new RegExp(`^${escape(item)}( \\d+)?$`) }).click();
}
