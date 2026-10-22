# Clavicule Sync

Service hébergé sur Cloudflare (Worker + stockage R2) qui garde le modèle 3D de chaque personnage.

- Le **plugin Dalamud** envoie le `.glb` du personnage à la connexion et quand son apparence change.
- L’**appli** l’affiche sur la fiche du personnage.

**Personne n’a de clé à saisir.**

- **Lecture publique.** L’apparence d’un personnage est déjà publique, en jeu comme sur le Lodestone.
- **Écriture protégée.** Le plugin génère seul un secret par personnage. Au premier envoi, le service vérifie sur le Lodestone que le personnage existe et porte bien ce nom, puis le lie à ce secret. Ensuite, lui seul peut remplacer ou supprimer le modèle.
- **Changement de PC.** Le plugin obtient un code `CLAVICULE-XXXXXXXX` que le joueur colle dans sa présentation Lodestone. Le service le lit, puis accepte le nouveau secret.

## Mise en ligne (une seule fois, par l’éditeur de l’appli)

Il faut un compte Cloudflare (gratuit) et Node.js.

```bash
cd server
npm install
npx wrangler login                               # autorise wrangler dans le navigateur
npx wrangler r2 bucket create clavicule-models   # crée le stockage
npm run deploy                                   # affiche l'adresse, ex. https://clavicule-sync.<compte>.workers.dev
```

Puis inscris cette adresse à deux endroits, et publie l’appli et le plugin :

- appli : `DEPLOYED_SYNC_URL` dans `src/constants/service.ts` ;
- plugin : `DeployedServiceUrl` dans `plugin/Clavicule.Plugin/Configuration.cs`.

Facultatif, pour la modération : `npx wrangler secret put ADMIN_TOKEN`. Cette clé permet de supprimer n’importe quel modèle et de libérer le personnage.

### Coûts

L’offre gratuite couvre 10 Go de stockage, environ 650 personnages à 15 Mo. Les téléchargements sont gratuits sans limite de volume. Au-delà de 10 Go, compter environ 0,015 $ par Go et par mois (10 000 personnages ≈ 2 $/mois).

## Développement

```bash
npm run dev        # service local sur http://localhost:8787
npm test           # tests de bout en bout (moteur Workers local + faux Lodestone)
npm run typecheck
```

Pour pointer l’appli vers le service local : `EXPO_PUBLIC_SYNC_URL=http://localhost:8787 npx expo start`. Pour le plugin : champ « Autre service » dans les options de `/clavicule`.

## API

| Méthode | Chemin | Authentification | Rôle |
| --- | --- | --- | --- |
| GET | `/health` | aucune | état du service |
| GET | `/v1/characters/:id/model/info` | aucune | taille, date, empreinte d’apparence |
| GET / HEAD | `/v1/characters/:id/model` | aucune | le `.glb` (ETag, réponse 304 si inchangé) |
| PUT | `/v1/characters/:id/model` | secret du personnage | envoi du `.glb` (50 Mo maximum, un envoi toutes les 30 s au plus) |
| DELETE | `/v1/characters/:id/model` | secret, ou clé d’admin | suppression du modèle |
| POST | `/v1/characters/:id/claim` | nouveau secret | demande d’un code à coller sur le Lodestone |
| POST | `/v1/characters/:id/claim/verify` | nouveau secret | vérification du code ; le personnage est lié au nouveau secret |

- `:id` est l’identifiant Lodestone du personnage.
- Le secret passe dans `Authorization: Bearer <secret>` et fait au moins 32 caractères.
- Le PUT accepte aussi `X-Character-Name` (encodé URL), `X-Character-World` et `X-Appearance-Hash`.
- En cas d’erreur, la réponse est `{ "error": "message lisible", "code": "claimed" | "rate-limited" | … }`.
