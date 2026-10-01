import { createContext } from 'react';

/** Emplacement de la barre de titre dans la coquille (au-dessus du contenu, sous la barre mobile). */
export const PageHeaderSlotContext = createContext<HTMLElement | null>(null);
