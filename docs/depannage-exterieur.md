# Dépannage extérieur : trajet calculé avec le trafic

À la création d'un OR (ou sur sa fiche), la carte « Lieu d'intervention » enregistre un dépannage
extérieur : adresse du lieu, distance et temps de trajet aller-retour, prix du déplacement.

- **Adresses** : service de géocodage de la Géoplateforme de l'IGN (`data.geopf.fr`), gratuit,
  sans clé, appelé depuis l'appli.
- **Distance et temps aller-retour** : Edge Function `trajet`, calcul d'itinéraire TomTom en
  voiture, trafic compris (départ prévu au planning, sinon maintenant). L'offre gratuite de TomTom
  donne 2 500 calculs par jour. Sans clé, l'appli indique de saisir la distance et le temps.

## Tarifs (Réglages › Atelier › Dépannage)

Distance aller-retour depuis l'atelier :

| Zone          | Distance       | Forfait              | Trajet compris               |
| ------------- | -------------- | -------------------- | ---------------------------- |
| 1 (proximité) | moins de 10 km | 60 € HT              | 30 min, sans tolérance       |
| 2             | 10 à 20 km     | 90 € HT              | 1 h, + 7 min de tolérance    |
| 3             | 20 à 40 km     | 130 € HT             | 1 h 30, + 7 min de tolérance |
| au-delà       | plus de 40 km  | prix saisi à la main |                              |

Trajet plus long : temps de trajet facturé au taux horaire du trajet (90 € HT), 1 h au moins puis
à la minute. Exemples : zone 1 en 40 min → 90 € ; zone 2 en 1 h 10 → 105 € ; zone 1 en 1 h 20 →
120 €. Un prix saisi sur l'OR remplace le calcul. La facture reçoit une seule ligne de déplacement.

## Mise en service de TomTom

1. Compte gratuit sur [developer.tomtom.com](https://developer.tomtom.com), puis
   **Dashboard › Keys** : la clé « My first API Key » convient (Routing API comprise).
2. Ajoute dans `supabase/.env.production` (fichier ignoré par git, ne le colle jamais ailleurs) :

```
TOMTOM_API_KEY=...
```

3. Puis :

```bash
npx supabase secrets set --env-file supabase/.env.production --project-ref liwvhqihlrupmtymfjtk
npx supabase functions deploy trajet --project-ref liwvhqihlrupmtymfjtk
```

## RGPD

Les coordonnées de l'atelier et du lieu d'intervention (pas le nom du client) sont envoyées à TomTom
pour le calcul ; l'adresse tapée est envoyée à l'IGN pour la retrouver.
