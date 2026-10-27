# Clavicule

Appli mobile (iPhone et Android) qui rassemble ce qu'on va chercher sur plusieurs sites quand on joue à **FINAL FANTASY XIV** : fiche du personnage, niveaux des jobs, équipement, collections, prix du marché.

Projet perso, pour soi et ses amis. Appli non officielle, sans lien avec Square Enix.

## Ce que fait la version 1

| Écran | Contenu | Source |
|---|---|---|
| **Personnages** | Personnages suivis, personnage principal | — |
| Fiche personnage · Profil | Titre, monde, race, divinité, Grande Compagnie, compagnie libre, présentation | [Lodestone](https://eu.finalfantasyxiv.com/lodestone/) |
| Fiche personnage · Jobs | Niveau et expérience de chaque job, par rôle | Lodestone |
| Fiche personnage · Équipement | Pièces portées, niveau d'objet, apparence, teinture, matérias | Lodestone |
| Fiche personnage · Collections | Hauts faits, montures, mascottes, orchestrions, emotes, coiffures, bardes, cartes, sorts de mage bleu… avec progression ; ce qui manque, comment l’obtenir, son prix au marché, et les objets de collection déjà en poche mais pas utilisés | Plugin Clavicule (relevé en jeu, téléphone connecté), Universalis pour les prix |
| **Marché** | Recherche d'objets vendables, favoris avec le prix le plus bas | [XIVAPI](https://v2.xivapi.com), [Universalis](https://universalis.app) |
| Fiche objet | Annonces, ventes récentes, prix moyen, ventes par jour ; centre de données ou région entière | Universalis |
| Fiche personnage · Inventaire, servants, courrier | Sacs, arsenal, cristaux, sacoches, gil ; servants (missions, ventes, inventaires) ; lettres. Recherche d'un objet partout. Téléphone connecté par un code affiché dans le plugin | Plugin Dalamud |
| **Réglages** | Lodestone Europe ou Amérique du Nord, serveur ou centre de données pour les prix | Universalis |

Tout est lu directement depuis le téléphone : pas de serveur à héberger, pas de compte à créer. Les personnages suivis et les favoris sont enregistrés sur le téléphone.

## Apparence 3D (facultatif)

La fiche d'un personnage peut afficher son **modèle 3D**, à faire tourner du doigt, avec un cadrage corps ou visage. Aucun réglage pour les joueurs :

1. **Le plugin Dalamud** (`plugin/`) exporte le personnage automatiquement, à la connexion et à chaque changement de tenue, puis l'envoie au service.
2. **Le service Clavicule Sync** (`server/`, sur Cloudflare) stocke un modèle par personnage. La lecture est publique ; l'écriture est protégée par un secret généré par le plugin.
3. **L'appli** affiche le bouton **3D** sur la fiche dès qu'un modèle existe, pour n'importe quel personnage.

Mise en ligne du service (une fois, par l'éditeur de l'appli) : [server/README.md](server/README.md). Installation du plugin : [plugin/README.md](plugin/README.md).

## Essayer sur ton téléphone

Il faut [Node.js](https://nodejs.org) 20 ou plus sur ton ordinateur, et l'appli **Expo Go** sur ton téléphone ([iPhone](https://apps.apple.com/app/expo-go/id982107779), [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)).

```bash
npm install
npx expo start
```

Scanne le QR code affiché avec l'appareil photo (iPhone) ou avec Expo Go (Android).

Sur Windows, **double-clique sur `lancer-appli.bat`** dans l'Explorateur (il faut [Git](https://git-scm.com/download/win) et [Node.js](https://nodejs.org) ; la première fois, autorise Node.js dans la fenêtre du pare-feu, sur les réseaux privés).

Sur Mac, **double-clique sur `lancer-appli.command`** dans le Finder. Il récupère les dernières modifications (`git pull`, seulement ce qui a changé), met à jour les bibliothèques si besoin et lance le serveur. Le téléphone et l'ordinateur doivent être sur le même Wi-Fi ; sinon, lance `npx expo start --tunnel`.

Le projet utilise **Expo SDK 58**. Expo Go ne lit qu'une seule version du SDK à la fois : si Expo Go affiche « Project is incompatible with this version of Expo Go », regarde quelle version il indique (« The installed version of Expo Go is for SDK … ») ; le projet doit être passé à cette version.

Pour installer la vraie appli sans Expo Go (et sans Mac) : le workflow GitHub « Appli iOS (ipa pour Sideloadly) » compile un `.ipa` non signé sur un Mac de GitHub (on le relance en augmentant le numéro de `.github/ipa-version`) ; [Sideloadly](https://sideloadly.io) le signe avec un identifiant Apple et l'installe depuis Windows ou Mac. Avec un compte Apple gratuit, l'appli doit être réinstallée tous les 7 jours et ne reçoit pas les notifications push.

## Limites connues

- **Textes du Lodestone en anglais** : l'appli lit les pages anglaises du Lodestone (race, titre, noms des pièces d'équipement…), car c'est la langue des règles de lecture communautaires. Les noms des jobs, eux, sont en français.
- **Le Lodestone n'a pas d'API officielle.** L'appli lit ses pages avec les sélecteurs CSS maintenus par la communauté ([lodestone-css-selectors](https://github.com/xivapi/lodestone-css-selectors)). Quand Square Enix modifie le site, il suffit de recopier la nouvelle version de ces fichiers dans `src/lodestone/selectors/`.
- **Collections** : relevées en jeu par le plugin, donc toujours à jour, mais seulement pour les personnages dont le téléphone est connecté au plugin.
- **Prix du marché** : envoyés par les joueurs à Universalis, ils peuvent dater de quelques heures sur les objets peu vendus.

## Prochaines étapes

1. **Plugin Dalamud** : synchroniser aussi ce qu'aucun site public ne montre (inventaire, servants et leurs inventaires, quêtes en cours).
2. Recettes et récolte, alertes de prix, plus de collections en détail.

## Développement

```bash
npm test             # tests (lecture du Lodestone, API, mise en forme)
npm run typecheck    # vérification des types
npm run lint
```

| Dossier | Contenu |
|---|---|
| `src/app/` | Écrans (Expo Router) : onglets, fiche personnage, fiche objet |
| `src/lodestone/` | Lecture des pages du Lodestone : interpréteur des sélecteurs communautaires, client, sélecteurs copiés |
| `src/api/` | Clients Universalis, XIVAPI, service Clavicule Sync (modèles 3D, données du plugin) (avec cache local) |
| `src/store/` | Réglages, personnages suivis, favoris (enregistrés sur le téléphone) |
| `src/components/` | Composants d'interface, graphiques, visionneuse 3D |
| `server/` | Service de synchro des modèles 3D (Cloudflare Worker + R2) |
| `plugin/` | Plugin Dalamud (C#) qui exporte et envoie le modèle 3D |

Les tests de lecture du Lodestone génèrent des pages qui respectent les sélecteurs communautaires (`src/lodestone/__tests__/build-html.ts`) et vérifient ce que l'appli en extrait.

---

FINAL FANTASY XIV © SQUARE ENIX CO., LTD. Tous droits réservés.
