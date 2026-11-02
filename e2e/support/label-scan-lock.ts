import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Le réglage « Lecture automatique des étiquettes » (app_settings.label_scan_enabled) est commun
// à toute l'appli : les specs qui le basculent tournent en parallèle (autres fichiers, desktop et
// mobile), chacune doit le garder pour elle seule le temps de ses tests.
const LOCK_DIR = join(tmpdir(), 'rts-atelier-e2e-label-scan.lock');
const OWNER_FILE = join(LOCK_DIR, 'owner');

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Verrou laissé par un worker arrêté net (plantage, Ctrl+C) : on peut le reprendre. */
async function isStale(): Promise<boolean> {
  try {
    const pid = Number(await readFile(OWNER_FILE, 'utf8'));
    return Number.isInteger(pid) && pid > 0 && !isAlive(pid);
  } catch {
    // Pas encore de propriétaire : verrou en cours de prise, sauf s'il traîne
    try {
      return Date.now() - (await stat(LOCK_DIR)).mtimeMs > 30_000;
    } catch {
      return false;
    }
  }
}

/** Attend d'avoir le réglage pour soi seul (verrou entre les workers de Playwright). */
export async function lockLabelScan(): Promise<void> {
  for (;;) {
    try {
      await mkdir(LOCK_DIR);
      await writeFile(OWNER_FILE, String(process.pid));
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if (await isStale()) await rm(LOCK_DIR, { recursive: true, force: true });
    else await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Rend le réglage aux autres specs (seulement si ce worker le détient). */
export async function unlockLabelScan(): Promise<void> {
  try {
    if (Number(await readFile(OWNER_FILE, 'utf8')) !== process.pid) return;
  } catch {
    return;
  }
  await rm(LOCK_DIR, { recursive: true, force: true });
}
