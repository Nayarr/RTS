import { StrictMode } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { initTheme } from '@/lib/theme';
import '@/styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

// Appli ouverte sans réseau (atelier, sous-sol) : connu dès le départ, pas seulement
// au prochain changement de connexion.
onlineManager.setOnline(navigator.onLine);

// Clair ou sombre, selon le choix fait sur cet appareil.
initTheme();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
