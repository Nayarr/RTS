// Outils de l'assistant permis selon le rôle : la direction a tout ; la réception lit ce qu'elle
// voit dans l'appli et ne prépare que des mails.
import { isActionTool, RECEPTION_ACTIONS } from './actions.ts';
import { DIRECTION_ONLY_TOOLS } from './tools.ts';

export function toolAllowed(name: string, direction: boolean): boolean {
  if (direction) return true;
  if (DIRECTION_ONLY_TOOLS.has(name)) return false;
  return !isActionTool(name) || RECEPTION_ACTIONS.has(name);
}
