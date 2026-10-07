// Questions types de l'Agent Direction, posées à la fonction « agent » de la base LOCALE.
//
//   npm run eval:agent              → toutes les questions
//   npm run eval:agent -- 4 23 30   → seulement celles-ci
//
// Prérequis : Supabase local démarré, données de démo chargées, Agent Direction activé, et la
// fonction servie avec la clé de l'API (npx supabase functions serve agent --env-file <fichier>).
// Chaque question part dans une nouvelle conversation et coûte environ 1 à 2 centimes.
// Résultat : tableau dans la console (outil attendu utilisé, réponse attendue) et détail en JSON.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const QUESTIONS = JSON.parse(
  readFileSync(new URL('../supabase/functions/agent/eval/questions.json', import.meta.url), 'utf8'),
);
const only = process.argv.slice(2).map(Number).filter(Boolean);
const status = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', shell: true });
const env = Object.fromEntries(
  status
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?([^"]*)"?$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
const url = env.API_URL ?? 'http://127.0.0.1:54321';
const db = createClient(url, env.ANON_KEY, { auth: { persistSession: false } });
const { data: session, error } = await db.auth.signInWithPassword({
  email: 'direction@rts.local',
  password: 'atelier-dev-2026',
});
if (error) throw error;
await db.from('app_settings').update({ agent_enabled: true }).eq('id', true);

// Prix Claude Sonnet 5.5 (dollars par million de jetons)
const PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
const results = [];
for (const item of QUESTIONS.filter((q) => !only.length || only.includes(q.id))) {
  const started = Date.now();
  const response = await fetch(`${url}/functions/v1/agent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: item.question,
      spoken: item.spoken ?? false,
      ...(item.alternatives ? { alternatives: item.alternatives } : {}),
    }),
  });
  const body = await response.json();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!response.ok) {
    results.push({ ...item, ok: false, error: body.error, seconds });
    console.log(`#${item.id} ERREUR ${body.error}`);
    continue;
  }
  const { data: turn } = await db
    .from('agent_turns')
    .select('tools, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens')
    .eq('id', body.turn_id)
    .single();
  const used = turn?.tools ?? [];
  const toolOk = item.tools.length === 0 || item.tools.some((t) => used.includes(t));
  const answerOk = item.answer ? new RegExp(item.answer, 'i').test(body.answer) : true;
  const cost =
    ((turn?.input_tokens ?? 0) * PRICE.input +
      (turn?.output_tokens ?? 0) * PRICE.output +
      (turn?.cache_read_tokens ?? 0) * PRICE.cacheRead +
      (turn?.cache_write_tokens ?? 0) * PRICE.cacheWrite) /
    1e6;
  results.push({ ...item, used, toolOk, answerOk, answer: body.answer, cost, seconds });
  console.log(
    `#${String(item.id).padStart(2)} ${toolOk && answerOk ? 'OK ' : 'NON'} outil:${toolOk ? 'oui' : 'non'} réponse:${answerOk ? 'oui' : 'non'} ${seconds}s ${cost.toFixed(4)}$ [${used.join(', ')}]`,
  );
}
const passed = results.filter((r) => r.toolOk && r.answerOk).length;
const total = results.reduce((sum, r) => sum + (r.cost ?? 0), 0);
console.log(`\n${passed}/${results.length} réussies · coût total ${total.toFixed(3)} $`);
const out = process.env.EVAL_OUT ?? 'agent-eval-resultats.json';
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`Détail : ${out}`);
