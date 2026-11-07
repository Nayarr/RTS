import { expect, test } from '@playwright/test';

test('robots d’IA : robots.txt et réserve TDM servis, liens clients /d/… en noindex', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'Fichiers statiques : un seul passage suffit');
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  const text = await robots.text();
  for (const agent of ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'CCBot', 'Google-Extended', 'PerplexityBot'])
    expect(text).toContain(`User-agent: ${agent}`);
  expect(text).toMatch(/User-agent: \*\s+Disallow: \/\s*$/);

  const tdm = await request.get('/.well-known/tdmrep.json');
  expect(tdm.ok()).toBe(true);
  expect(await tdm.json()).toEqual([{ location: '/*', 'tdm-reservation': 1 }]);

  // Lien envoyé au client : pas d'indexation ni d'usage par une IA
  await page.goto('/d/lien-inconnu');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai',
  );
  await expect(page.locator('meta[name="tdm-reservation"]')).toHaveAttribute('content', '1');
});
