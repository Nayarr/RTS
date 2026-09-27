/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA : site classique sur PC, « vraie » appli plein écran une fois installée
    // sur téléphone / tablette (display: standalone, sans barre d'adresse).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'RTS Atelier — Rapid Truck Service',
        short_name: 'RTS Atelier',
        description: 'Ordres de réparation, badgeage, devis et facturation de l’atelier Rapid Truck Service',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#111111',
        theme_color: '#137017',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Toutes les routes de l'appli retombent sur index.html, y compris hors connexion.
        // Seuls les fichiers de l'appli sont mis en cache : les appels à Supabase
        // (autre domaine) ne passent jamais par le cache du service worker.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Après une mise en ligne, les fichiers de l'ancienne version sont retirés du cache.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Valeurs factices : les tests unitaires n'appellent jamais Supabase (modules simulés).
    env: {
      // Heures affichées comme à l'atelier, quel que soit le fuseau de la machine (CI en UTC).
      TZ: 'Europe/Paris',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_0000000000',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/types/**',
        'src/components/ui/**',
        'src/main.tsx',
      ],
    },
  },
});
