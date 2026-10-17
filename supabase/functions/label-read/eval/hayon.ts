// Essai de la lecture d'étiquette hayon sur les photos de ce dossier (vraies étiquettes poinçonnées).
//
//   deno run --allow-read --allow-env --allow-net supabase/functions/label-read/eval/hayon.ts
//
// La clé de l'API se lit dans la variable ANTHROPIC_API_KEY de ton terminal (jamais dans le code).
// Même consigne et même schéma que la fonction label-read ; environ 2 centimes par photo.
import Anthropic from '@anthropic-ai/sdk';
import {
  nextDueMonth,
  TAILGATE_READING_SCHEMA,
  type TailgateReading,
  tailgateReadingPrompt,
} from '../reading.ts';

const dir = new URL('./', import.meta.url);
const cases = JSON.parse(await Deno.readTextFile(new URL('expected.json', dir))) as {
  file: string;
  due_month: string;
  note: string;
}[];
const claude = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const today = new Date().toISOString().slice(0, 10);
let ok = 0;
for (const item of cases) {
  const bytes = await Deno.readFile(new URL(item.file, dir));
  const data = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  const message = await claude.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 16000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TAILGATE_READING_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/webp', data } },
        { type: 'text', text: tailgateReadingPrompt(today) },
      ],
    }],
  });
  const text = message.content.find((block) => block.type === 'text');
  const reading = JSON.parse(text?.type === 'text' ? text.text : '{}') as TailgateReading;
  const due = nextDueMonth(reading, today);
  const good = due === item.due_month;
  if (good) ok++;
  console.log(
    `${good ? 'OK ' : 'KO '} ${item.file} : lu ${
      due ?? '(rien)'
    }, attendu ${item.due_month} (${reading.confidence})`,
  );
  console.log(`    ${reading.label_text}`);
}
console.log(`\n${ok}/${cases.length} étiquettes lues correctement`);
