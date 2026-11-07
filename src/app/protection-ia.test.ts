import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/** Groupes du robots.txt : robots nommés → règles. */
function robotsGroups(text: string) {
  const groups: { agents: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[] } | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(key ?? '')) {
      if (!current || current.disallow.length) groups.push((current = { agents: [], disallow: [] }));
      current.agents.push(value);
    } else if (/^disallow$/i.test(key ?? '') && current) current.disallow.push(value);
  }
  return groups;
}

describe('protection contre les robots d’IA', () => {
  const groups = robotsGroups(read('public/robots.txt'));
  const blocked = (agent: string) =>
    groups.some((group) => group.agents.includes(agent) && group.disallow.includes('/'));

  it.each([
    'GPTBot',
    'ChatGPT-User',
    'ClaudeBot',
    'anthropic-ai',
    'Claude-Web',
    'CCBot',
    'Google-Extended',
    'PerplexityBot',
    'Bytespider',
    'Applebot-Extended',
    'Amazonbot',
    'meta-externalagent',
  ])('robots.txt interdit tout le site à %s', (agent) => {
    expect(blocked(agent)).toBe(true);
  });

  it('robots.txt : rien à explorer pour les autres robots non plus', () => {
    expect(blocked('*')).toBe(true);
    expect(read('public/robots.txt')).not.toMatch(/^Allow:/im);
  });

  it('en-têtes Vercel : X-Robots-Tag noindex / noai et réserve TDM sur toutes les pages', () => {
    const config = JSON.parse(read('vercel.json')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const all = config.headers.find((rule) => rule.source === '/(.*)')?.headers ?? [];
    const robots = all.find((header) => header.key === 'X-Robots-Tag')?.value ?? '';
    for (const directive of ['noindex', 'nofollow', 'noarchive', 'noai', 'noimageai'])
      expect(robots.split(', ')).toContain(directive);
    expect(all).toContainEqual({ key: 'tdm-reservation', value: '1' });
  });

  it('page (liens clients /d/… compris) : balises robots noindex / noai et tdm-reservation', () => {
    const html = read('index.html');
    expect(html).toMatch(
      /<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai" \/>/,
    );
    expect(html).toContain('<meta name="tdm-reservation" content="1" />');
  });

  it('réserve TDM (TDMRep) publiée pour tout le site', () => {
    expect(JSON.parse(read('public/.well-known/tdmrep.json'))).toEqual([
      { location: '/*', 'tdm-reservation': 1 },
    ]);
  });
});
