# Clavicule Sync

Petit service hébergé sur Cloudflare (gratuit à l’échelle d’un groupe d’amis) qui stocke les modèles 3D des personnages.

- Le **plugin Dalamud** de chaque joueur envoie le `.glb` de son personnage à la connexion et quand son apparence change.
- L’**appli** les télécharge avec la clé de lecture du groupe, puis les garde en cache sur le téléphone.

Stockage : un bucket R2 (`clavicule-models`). L’offre gratuite de R2 couvre 10 Go, soit plusieurs centaines de personnages.

## Mise en ligne (une seule fois)

Il faut un compte Cloudflare (gratuit) et Node.js.

```bash
cd server
npm install
npx wrangler login                                   # ouvre le navigateur pour autoriser wrangler
npx wrangler r2 bucket create clavicule-models       # crée le stockage
npx wrangler secret put READ_TOKEN                   # colle une clé longue et aléatoire : la clé de lecture du groupe
npx wrangler secret put WRITE_TOKENS                 # colle {"anton":"clé-1","amie":"clé-2"} : une clé d'écriture par joueur
npm run deploy                                       # affiche l'adresse, ex. https://clavicule-sync.<compte>.workers.dev
```

Pour générer une clé : `node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"`.

Ensuite :

- **Dans l’appli** (Réglages → Modèles 3D) : l’adresse du service et la clé de lecture.
- **Dans le plugin** (`/clavicule` en jeu) : l’adresse du service et sa clé d’écriture personnelle.

Pour ajouter un ami : relancer `npx wrangler secret put WRITE_TOKENS` avec la liste complète.

## Développement

```bash
npm run dev        # service local sur http://localhost:8787 (clés dans .dev.vars, non versionné)
npm test           # tests de bout en bout sur le moteur Workers local
npm run typecheck
```

Exemple de `.dev.vars` :

```
READ_TOKEN=lecture-groupe
WRITE_TOKENS={"anton":"ecriture-anton"}
```

## API

| Méthode | Chemin | Clé | Rôle |
| --- | --- | --- | --- |
| GET | `/health` | aucune | état du service |
| GET | `/v1/characters` | lecture | personnages qui ont un modèle |
| GET | `/v1/characters/:id/model/info` | lecture | taille, date, empreinte d’apparence |
| GET / HEAD | `/v1/characters/:id/model` | lecture | le `.glb` (ETag, réponse 304 si inchangé) |
| PUT | `/v1/characters/:id/model` | écriture | envoi du `.glb` (95 Mo maximum) |

Les clés passent dans l’en-tête `Authorization: Bearer <clé>`. `:id` est l’identifiant Lodestone du personnage.
Le PUT accepte aussi `X-Character-Name` (encodé URL), `X-Character-World` et `X-Appearance-Hash`.
