# Tri des mails par l'Agent Direction

Les boîtes de l'atelier restent chez o2switch et gardent tous leurs mails. Chaque boîte suivie
renvoie en plus une **copie** de chaque mail reçu à une adresse de réception Resend. Resend
prévient l'appli (Edge Function `mail-inbox`), qui garde le mail en texte brut, reconnaît le
client par son adresse et le fait trier par Claude Haiku : catégorie, urgence, résumé d'une ligne,
réponse attendue ou non.

La direction retrouve les mails dans **Agent Direction › Mails reçus**. Les mails urgents et le
nombre de mails à traiter apparaissent dans le **point du jour**, et l'agent répond aux questions
sur les mails (« qu'est-ce que Moreau m'a demandé ? »).

## Ce qui est gardé, et combien de temps

- Expéditeur, destinataires, objet, texte du mail (20 000 caractères au plus), noms des pièces
  jointes. Le contenu des pièces jointes n'est pas gardé.
- Copies effacées automatiquement après 90 jours. Le mail d'origine reste dans la boîte o2switch.
- Lecture réservée à la direction. Personne ne peut modifier ni effacer une copie depuis l'appli.
- Mails ignorés : Agent Direction désactivé, ou mail qui n'est adressé à aucune adresse du domaine
  d'envoi réglé dans Réglages › Atelier (protection contre les envois directs à l'adresse Resend).
- Coût : environ 0,13 centime par mail trié (Claude Haiku 4.5).
- RGPD : ajouter « tri des mails reçus » au registre des traitements (finalité : gestion de la
  relation client et fournisseurs ; sous-traitants : Resend, Anthropic, Supabase ; durée : 90 jours).

## Mise en service

### 1. Adresse de réception Resend

Dans Resend : **Emails › onglet Receiving › trois points › Receiving address**. Resend affiche un
domaine du type `xxxxxxxx.resend.app`. N'importe quel début d'adresse fonctionne : choisis-en un
difficile à deviner, par exemple `rts-tri-7f3k9q@xxxxxxxx.resend.app`. Note cette adresse.

### 2. Webhook vers l'appli

Dans Resend : **Webhooks › Add endpoint**.

- URL : `https://liwvhqihlrupmtymfjtk.supabase.co/functions/v1/mail-inbox`
- Événement : `email.received` uniquement.

Une fois créé, copie le **Signing secret** (il commence par `whsec_`).

### 3. Clé Resend pour lire les mails reçus

La clé d'envoi actuelle (accès « Sending access ») ne permet pas de lire les mails reçus. Dans
Resend : **API Keys › Create API key**, nom `rts-reception`, permission **Full access**. Copie la
clé.

### 4. Secrets et déploiement

Ajoute dans `supabase/.env.production` (fichier ignoré par git, ne le colle jamais ailleurs) :

```
RESEND_WEBHOOK_SECRET=whsec_...
RESEND_RECEIVING_API_KEY=re_...
```

Puis :

```bash
npx supabase secrets set --env-file supabase/.env.production --project-ref liwvhqihlrupmtymfjtk
npx supabase functions deploy mail-inbox --project-ref liwvhqihlrupmtymfjtk
```

### 5. Copie des boîtes dans cPanel (o2switch)

Dans cPanel : **E-mail › Redirecteurs › Ajouter un redirecteur**, pour chaque boîte à suivre
(`atelier@`, `facturation@`…) :

- Adresse à rediriger : la boîte, par exemple `atelier`, domaine `rapidtruckservice.fr`.
- Destination : **Rediriger vers une adresse e-mail** : l'adresse Resend de l'étape 1.

La boîte continue de recevoir ses mails normalement : le redirecteur envoie seulement une copie.
Pour arrêter le suivi d'une boîte, supprime son redirecteur.

### 6. Vérification

1. Réglages › Atelier : Agent Direction activé, domaine d'envoi `rapidtruckservice.fr` renseigné.
2. Depuis une messagerie personnelle, envoie un mail à `atelier@rapidtruckservice.fr`.
3. Moins d'une minute après, il apparaît trié dans Agent Direction › Mails reçus.

En cas de souci : Resend › Webhooks › l'endpoint montre chaque appel et la réponse de l'appli
(`Signature invalide` : secret de l'étape 2 mal copié ; `Clé Resend absente` ou erreur 502 :
clé de l'étape 3). Un mail que le tri n'a pas pu classer est retrié automatiquement toutes les
10 minutes (3 essais), et reste lisible dans la liste dans tous les cas.
