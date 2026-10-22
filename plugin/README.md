# Plugin Dalamud Clavicule

Envoie automatiquement l’apparence 3D de ton personnage à l’appli Clavicule, sans export manuel :

1. À la connexion, puis toutes les 2 secondes, le plugin calcule une empreinte de l’apparence (visage, corps, équipement, teintures, armes, lunettes).
2. Si elle a changé depuis le dernier envoi et reste stable 6 secondes, il attend que le personnage soit au repos. Au repos veut dire : à pied, hors combat, arme rangée, pas d’emote ni de cinématique.
3. Il reconstruit alors le modèle avec le code de [Meddle](https://github.com/PassiveModding/Meddle), en sous-module dans `vendor/Meddle`. Les couleurs du jeu (peau, cheveux, yeux, teintures) sont « cuites » dans des textures standard.
4. Il envoie le `.glb` au service Clavicule Sync (dossier `server/` du dépôt), dont l’adresse est intégrée au plugin.
   - L’identifiant Lodestone du personnage est trouvé tout seul.
   - Un secret propre au personnage, généré automatiquement, empêche quelqu’un d’autre de remplacer son modèle.

Aucune clé ni adresse à saisir.

## Installation

1. Télécharge `latest.zip` depuis l’onglet **Actions** du dépôt : dernier passage de « Plugin Dalamud », artefact `Clavicule-plugin`. Décompresse-le dans un dossier, par exemple `C:\Clavicule`.
2. En jeu, tape `/xlsettings`. Dans **Experimental → Dev Plugin Locations**, ajoute le chemin vers `Clavicule.dll`, puis sauvegarde.
3. Tape `/xlplugins`, onglet **Dev Tools → Installed Dev Plugins**, et active **Clavicule**.
4. C’est tout : l’envoi est automatique. `/clavicule` montre l’état, et « Envoyer maintenant » permet un premier essai immédiat.

**Changement de PC ou réinstallation** : le service reconnaît que ce n’est plus le même ordinateur. `/clavicule` guide alors en 3 clics :

1. obtenir un code ;
2. le coller dans ta présentation Lodestone ;
3. vérifier.

Tu peux retirer le code ensuite.

**Inventaire, servants et courrier dans l’appli** :

1. Dans `/clavicule`, section « Appli mobile », clique sur « Connecter un téléphone ».
2. Dans l’appli, sur la fiche de ton personnage, touche « Inventaire · Servants · Courrier » et saisis le code à 6 chiffres.

Le plugin envoie aussi tes **collections**, lues directement en jeu : montures, mascottes, rouleaux d’orchestrion, emotes, coiffures, bardes de chocobo, accessoires de mode et de visage, cartes Triple Triade, sorts de mage bleu, et hauts faits (points compris). Le jeu ne charge les hauts faits que sur demande : le plugin les demande une fois par connexion, comme le fait la fenêtre « Hauts faits ».

Avec les collections, le plugin envoie un **catalogue** : tout ce qui existe dans chaque collection, l’objet qui le débloque, s’il se vend au marché, et comment l’obtenir. La provenance est tirée des données du jeu : récompense de haut fait ou de quête, artisanat, boutiques (gils, sceaux, marques de loup, points du Gold Saucer…), description des rouleaux d’orchestrion. Le catalogue est construit une fois par session en tâche de fond, et renvoyé seulement s’il a changé, en pratique après une mise à jour du jeu. Les règles de provenance reprennent celles de [FFXIV Collect](https://github.com/fae-industries/ffxiv-collect) (licence MIT).

Ces données ne sont visibles que sur les téléphones connectés, et tu peux les retirer depuis la même section. Quelques données ne sont lisibles qu’à certains moments, et le plugin garde la dernière version vue :

- l’inventaire d’un servant : ouvre-le à la sonnette ;
- le courrier : ouvre ta boîte aux lettres ;
- les sacoches : ouvre-les une fois.

**ATH et barres d’actions depuis l’appli** (même connexion que l’inventaire) :

- Fiche du personnage → « ATH du jeu » : les 4 dispositions du jeu en miniature. Fais glisser un élément pour le déplacer ; touche-le pour le masquer, changer sa taille (60 à 200 %), son opacité, ou la forme d’une barre d’actions (12×1 à 1×12).
- « Barres d’actions » : les barres 1 à 10 de chaque job. Touche une case puis une autre pour les échanger, ou vide une case. Pour ta sécurité, l’appli ne peut que réorganiser ce qui est déjà dans tes barres.
- « Envoyer au jeu » : si le jeu tourne, le plugin applique la modification en quelques secondes. Il attend d’être hors combat, éditeur d’ATH fermé, hors cinématique. Si le jeu est fermé, elle s’applique à ta prochaine connexion. L’appli montre l’état de chaque envoi.
- Option dans `/clavicule` : « Modifier l’ATH et les barres d’actions depuis l’appli ».

Commandes :

- `/clavicule` ouvre les réglages.
- `/clavicule envoyer` envoie l’apparence tout de suite.

Le modèle apparaît ensuite dans l’appli : fiche du personnage, bouton **3D**.

Options (facultatives) :

- **Taille des textures** : 1024 par défaut, environ 10 à 20 Mo par personnage. 512 si l’envoi est lent.
- **Inclure les armes** et **Relief des textures** se désactivent pour alléger.
- **Retirer mon modèle de l’appli** le supprime du service et coupe l’envoi automatique.

## Limites connues (première version)

- Le rendu des matériaux est une approximation des shaders du jeu. Peau, cheveux, yeux, peinture faciale et équipement teint sont gérés. Reflets et effets spéciaux ne le sont pas encore.
- Le plugin n’a pas encore été essayé en jeu. En cas de souci, le journal `/xllog` (filtre « Clavicule ») aide à corriger.
- ATH : l’aperçu de l’appli dessine chaque élément à sa taille de base. Quelques éléments affichés autrement par le jeu (jauges en mode simplifié, par exemple) peuvent paraître un peu décalés dans l’aperçu, pas en jeu.

## Développement

Il faut le SDK .NET 10 et les bibliothèques de Dalamud. XIVLauncher les installe ; sinon, décompresse `https://raw.githubusercontent.com/goatcorp/dalamud-distrib/main/latest.zip` et indique le dossier dans `DALAMUD_HOME`.

```bash
git submodule update --init --recursive
dotnet test Clavicule.Core.Tests          # cuisson des matériaux, Lodestone, envoi
dotnet build Clavicule.Plugin -c Release  # produit Clavicule.Plugin/bin/Release/Clavicule/latest.zip
```

Pour tester l’envoi contre un service local, lance `npx wrangler dev --persist-to $(mktemp -d)` dans `server/`, puis exporte `CLAVICULE_SYNC_URL=http://localhost:8787` avant `dotnet test`.

Organisation :

- `Clavicule.Core` : code sans dépendance au jeu, testé sous Linux.
  - `Baking/` : cuisson des matériaux.
  - `Sync/` : recherche Lodestone et client du service.
- `Clavicule.Plugin` : le plugin.
  - Surveillance de l’apparence.
  - Pont vers Meddle.
  - Fenêtre `/clavicule`.

## Licence

AGPL-3.0, comme Meddle dont ce plugin réutilise le code (voir `LICENSE.txt`). La cuisson des matériaux s’inspire des anciens « material builders » de Meddle. La liste des éléments de l’ATH et le format des dispositions viennent du plugin [HUD Manager](https://github.com/zacharied/FFXIV-Plugin-HudManager) (GPL-3.0).
