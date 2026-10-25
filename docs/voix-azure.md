# Voix naturelle de l'Agent Direction (Azure)

L'Agent Direction lit ses réponses et le point du jour à voix haute. Deux voix :

- **Voix du navigateur** : gratuite, sur l'appareil. Elle dépend de l'ordinateur ou du téléphone
  (naturelle sur Edge, plus robotique ailleurs).
- **Voix naturelle Azure** (Microsoft) : la même voix neuronale sur tous les appareils. Le niveau
  gratuit (F0) donne 500 000 caractères par mois et n'est jamais facturé.

Le texte est d'abord écrit pour l'oreille (montants, numéros de devis et de factures, dates,
heures, plaques, sigles), quelle que soit la voix.

## Ce que fait l'appli

- Chaque lecture passe par l'Edge Function `tts`, réservée à la direction, Agent Direction activé.
- Les caractères lus sont comptés par mois. Au-delà du plafond réglé (480 000 par défaut, sous le
  niveau gratuit), l'agent repasse sur la voix du navigateur jusqu'au mois suivant.
- Sans clé Azure, réseau coupé, plafond atteint ou lecture bloquée par le navigateur : voix du
  navigateur, sans message d'erreur.
- Une phrase déjà lue est gardée le temps de la visite (relire le point du jour ne compte rien de
  plus) ; pendant le point du jour, la phrase suivante est préparée à l'avance.

Volume attendu : point du jour (environ 1 500 caractères par jour ouvré) et une vingtaine de
réponses par jour, soit moins de 200 000 caractères par mois.

## Mise en service

### 1. Ressource Azure

Sur [portal.azure.com](https://portal.azure.com) (Azure for Students du pack GitHub Education,
sans carte bancaire) : **Créer une ressource › Speech**.

- Région : **France Central**.
- Niveau tarifaire : **Free F0**.

Une fois créée : **Clés et point de terminaison**, copie la **clé 1**.

### 2. Secrets

Ajoute dans `supabase/.env.production` (fichier ignoré par git, ne le colle jamais ailleurs) :

```
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=francecentral
```

Puis :

```bash
npx supabase secrets set --env-file supabase/.env.production --project-ref liwvhqihlrupmtymfjtk
npx supabase functions deploy tts --project-ref liwvhqihlrupmtymfjtk
```

### 3. Réglages

Réglages › Atelier › **Voix de l'Agent** : « Voix naturelle Azure », choix de la voix (Ximena par
défaut, voix multilingue lue en français de France), « Écouter un essai ». Le compteur du mois s'affiche à côté.

## RGPD

Le texte lu (noms de clients, montants) est envoyé à Microsoft, en région France Central (Union
européenne) ; Azure ne garde pas le texte envoyé à la synthèse vocale. À ajouter au registre des
traitements (sous-traitant : Microsoft Azure, finalité : lecture à voix haute des réponses de
l'Agent Direction).
