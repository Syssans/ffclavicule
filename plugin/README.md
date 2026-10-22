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

Commandes :

- `/clavicule` ouvre les réglages.
- `/clavicule envoyer` envoie l’apparence tout de suite.

Le modèle apparaît ensuite dans l’appli : fiche du personnage, bouton **3D**.

Options (facultatives) :

- **Taille des textures** : 1024 par défaut, environ 10 à 20 Mo par personnage. 512 si l’envoi est lent.
- **Inclure les armes** et **Relief des textures** se désactivent pour alléger.
- **Retirer mon modèle de l’appli** le supprime du service et coupe l’envoi automatique.

## Limites connues (première version)

- Le rendu des matériaux est une approximation des shaders du jeu. Peau, cheveux, yeux et équipement teint sont gérés. Peintures faciales, reflets et effets spéciaux ne le sont pas encore.
- Le plugin n’a pas encore été essayé en jeu. En cas de souci, le journal `/xllog` (filtre « Clavicule ») aide à corriger.

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

AGPL-3.0, comme Meddle dont ce plugin réutilise le code (voir `LICENSE.txt`). La cuisson des matériaux s’inspire des anciens « material builders » de Meddle.
