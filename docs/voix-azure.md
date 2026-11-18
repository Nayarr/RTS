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

## Dictée sur iPhone (Edge Function `stt`)

Sur iPhone, la dictée de Safari ne rend plus le micro après la lecture d'une réponse à voix haute :
la première question passe, la suivante n'est jamais entendue et le voyant orange du micro reste
allumé (bug de WebKit, pas de l'appli). Sur iPhone et iPad, l'Agent Direction et le point du jour
n'utilisent donc plus la dictée de Safari :

- l'appli ouvre elle-même le micro et enregistre la question ;
- la question part après une pause d'environ 1,3 s (8 s sans rien entendre : abandon, 30 s au
  plus), ou à l'appui sur le bouton ;
- le micro est coupé aussitôt (voyant éteint), avant l'envoi ;
- l'enregistrement (WAV 16 kHz, quelques centaines de Ko) passe par l'Edge Function `stt`, réservée
  au bureau, Agent Direction activé, qui le fait transcrire par Azure en français et renvoie les
  autres versions entendues (l'agent choisit celle qui a un sens dans un atelier).

Ordinateur et Android gardent la dictée du navigateur, ainsi que la dictée des travaux sur la
fiche OR.

Micro qui ne répond pas : le son est créé pendant l'appui sur le bouton (sur iPhone, un son créé
après coup peut rester suspendu et l'écoute ne recevait plus rien). Si aucun son n'arrive dans les
3 s, ou si iOS reprend le micro (appel, Siri), le micro est rendu et l'appli affiche « Le micro ne
répond pas » : l'appui suivant repart de zéro au lieu de rester bloqué en écoute.

Autorisation du micro redemandée : une appli installée sur l'écran d'accueil d'un iPhone ne garde
l'autorisation que tant qu'elle reste ouverte. Quand iOS la ferme (après un moment en arrière-plan,
ou balayée vers le haut), il la redemande à la question suivante. C'est une règle d'iOS : l'appli ne
peut ni l'éviter ni la retenir.

Même clé et même région que la voix : rien à ajouter. Le niveau gratuit (F0) donne 5 heures de
reconnaissance par mois (à vérifier sur le portail Azure) et n'est jamais facturé ; au-delà, Azure
refuse et l'appli propose d'écrire la question. Une question dure quelques secondes : plusieurs
milliers de questions par mois tiennent dans le niveau gratuit.

Déploiement :

```bash
npx supabase functions deploy stt --project-ref liwvhqihlrupmtymfjtk
```

RGPD : l'enregistrement de la question est envoyé à Microsoft (France Central). Microsoft indique
ne pas garder l'audio de la reconnaissance en temps réel : à vérifier dans la page « Data, privacy
and security » d'Azure Speech avant la mise en service. Même sous-traitant que la voix, finalité à compléter :
transcription des questions posées à la voix à l'Agent Direction.
