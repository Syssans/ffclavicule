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
| Fiche personnage · Collections | Hauts faits, montures, mascottes, orchestrions, emotes, cartes… avec progression | [FFXIV Collect](https://ffxivcollect.com) |
| **Marché** | Recherche d'objets vendables, favoris avec le prix le plus bas | [XIVAPI](https://v2.xivapi.com), [Universalis](https://universalis.app) |
| Fiche objet | Annonces, ventes récentes, prix moyen, ventes par jour ; centre de données ou région entière | Universalis |
| **Réglages** | Lodestone Europe ou Amérique du Nord, serveur ou centre de données pour les prix | Universalis |

Tout est lu directement depuis le téléphone : pas de serveur à héberger, pas de compte à créer. Les personnages suivis et les favoris sont enregistrés sur le téléphone.

## Apparence 3D (facultatif)

La fiche d'un personnage peut afficher son **modèle 3D**, à faire tourner du doigt, avec un cadrage corps ou visage. Pour cela, trois pièces travaillent ensemble :

1. **Le plugin Dalamud** (`plugin/`) : il exporte le personnage automatiquement, à la connexion et à chaque changement de tenue, puis l'envoie au service.
2. **Le service de synchro** (`server/`) : il est hébergé gratuitement sur Cloudflare et stocke un modèle par personnage.
3. **L'appli** : dans Réglages → Modèles 3D, renseigne l'adresse du service et la clé de lecture du groupe. Sur la fiche, le bouton **3D** apparaît dès qu'un modèle existe.

Mise en place : [server/README.md](server/README.md), puis [plugin/README.md](plugin/README.md).

## Essayer sur ton téléphone

Il faut [Node.js](https://nodejs.org) 20 ou plus sur ton ordinateur, et l'appli **Expo Go** sur ton téléphone ([iPhone](https://apps.apple.com/app/expo-go/id982107779), [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)).

```bash
npm install
npx expo start
```

Scanne le QR code affiché avec l'appareil photo (iPhone) ou avec Expo Go (Android). Le téléphone et l'ordinateur doivent être sur le même Wi-Fi ; sinon, lance `npx expo start --tunnel`.

Le projet utilise **Expo SDK 57**. Expo Go ne lit qu'une seule version du SDK à la fois : si Expo Go affiche « Project is incompatible with this version of Expo Go », regarde quelle version il indique (« The installed version of Expo Go is for SDK … ») ; le projet doit être passé à cette version.

Pour installer l'appli sans Expo Go et la partager avec tes amis, il faudra la compiler avec [EAS Build](https://docs.expo.dev/build/introduction/).

## Limites connues

- **Textes du Lodestone en anglais** : l'appli lit les pages anglaises du Lodestone (race, titre, noms des pièces d'équipement…), car c'est la langue des règles de lecture communautaires. Les noms des jobs, eux, sont en français.
- **Le Lodestone n'a pas d'API officielle.** L'appli lit ses pages avec les sélecteurs CSS maintenus par la communauté ([lodestone-css-selectors](https://github.com/xivapi/lodestone-css-selectors)). Quand Square Enix modifie le site, il suffit de recopier la nouvelle version de ces fichiers dans `src/lodestone/selectors/`.
- **FFXIV Collect** ne connaît un personnage qu'après un premier import sur son site. L'appli propose d'ouvrir la page pour le faire.
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
| `src/api/` | Clients Universalis, XIVAPI, FFXIV Collect, service de synchro 3D (avec cache local) |
| `src/store/` | Réglages, personnages suivis, favoris (enregistrés sur le téléphone) |
| `src/components/` | Composants d'interface, graphiques, visionneuse 3D |
| `server/` | Service de synchro des modèles 3D (Cloudflare Worker + R2) |
| `plugin/` | Plugin Dalamud (C#) qui exporte et envoie le modèle 3D |

Les tests de lecture du Lodestone génèrent des pages qui respectent les sélecteurs communautaires (`src/lodestone/__tests__/build-html.ts`) et vérifient ce que l'appli en extrait.

---

FINAL FANTASY XIV © SQUARE ENIX CO., LTD. Tous droits réservés.
