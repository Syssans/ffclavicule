# ffclavicule

Un serveur qui fait tourner **FINAL FANTASY XIV** pour plusieurs joueurs. Chaque joueur joue depuis n'importe quel appareil (PC, Mac, Linux, téléphone, tablette, TV, Steam Deck) **sans télécharger le jeu** : il reçoit l'image et le son en streaming, et renvoie clavier, souris et manette.

Le jeu (environ 100 Go) est installé **une seule fois** sur le serveur et partagé par toutes les sessions.

## Comment ça marche

```
 Appareil du joueur                          Serveur Linux avec GPU
┌──────────────────┐   vidéo/son   ┌──────────────────────────────────────────────┐
│ Moonlight        │ ◀──────────── │ Wolf (serveur de streaming)                   │
│ (toutes          │ ────────────▶ │   ├─ session joueur A : conteneur FFXIV ──┐   │
│  plateformes)    │ clavier,      │   ├─ session joueur B : conteneur FFXIV ──┤   │
└──────────────────┘ souris,       │   └─ ...                                  │   │
                     manette       │                                           ▼   │
                                   │  game/  jeu partagé, lecture seule ◀──────┘   │
                                   │  wolf/players/<nom>/  données de chaque joueur│
                                   └──────────────────────────────────────────────┘
```

| Brique | Rôle |
|---|---|
| [Wolf](https://github.com/games-on-whales/wolf) | Serveur de streaming compatible Moonlight. Crée un bureau virtuel et un conteneur isolé **par joueur**, sur le même GPU. |
| [XIVLauncher.Core](https://github.com/goatcorp/XIVLauncher.Core) (1.4.0) | Launcher FFXIV open source pour Linux : connexion au compte Square Enix, installation, mises à jour, Wine optimisé. |
| [Moonlight](https://moonlight-stream.org) | Client de streaming gratuit : Windows, macOS, Linux, Android, iOS/iPadOS, Apple TV, Steam Deck, ChromeOS. |
| `./ffclavicule` | Outil d'administration de ce dépôt : installation, appairage des appareils, joueurs, maintenance. |

Ce que chaque joueur a pour lui seul, dans `wolf/players/<nom>/` : réglages de XIVLauncher, préfixe Wine, Dalamud et configuration du jeu (macros, interface, raccourcis). Environ 1 à 2 Go par joueur.

## Prérequis du serveur

- Linux 64 bits avec **Docker Engine** et Docker Compose, Python 3.11 ou plus récent.
- Un **GPU** pour faire tourner le jeu et encoder la vidéo : Intel ou AMD (le plus simple), ou NVIDIA avec [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) ≥ 1.16, pilote ≥ 530.30.02 et `nvidia-drm.modeset=1` (voir la [doc de Wolf](https://games-on-whales.github.io/wolf/stable/user/quickstart.html)).
- Disque : environ 100 Go pour le jeu, plus 2 Go par joueur. Prévoir de la marge pour les mises à jour.
- Réseau : un bon débit montant (environ 20 Mb/s par joueur en 1080p). Plus le serveur est proche des joueurs, moins il y a de latence.

## Installation

```bash
git clone https://github.com/syssans/ffclavicule.git && cd ffclavicule
sudo ./ffclavicule setup            # ajoute --nvidia sur une carte NVIDIA
```

`setup` crée `.env` (réglages modifiables), installe les règles udev des manettes virtuelles, construit l'image de session (`image/`), démarre Wolf et active le mode maintenance pour la première installation du jeu. Les données vont dans `/srv/ffclavicule` (modifiable dans `.env`).

## Ajouter un joueur

1. Le joueur installe [Moonlight](https://moonlight-stream.org) et ajoute le serveur avec son adresse IP.
2. Moonlight affiche un code PIN. Sur le serveur :
   ```bash
   sudo ./ffclavicule pair 1234 --player anton
   ```
3. Le joueur voit **FINAL FANTASY XIV** dans Moonlight, le lance, et se connecte avec **son propre compte Square Enix** dans XIVLauncher.

Un joueur qui utilise plusieurs appareils les appaire chacun avec le même `--player` : il retrouve ses réglages partout. `sudo ./ffclavicule players` liste les appareils, `assign` et `unpair` les modifient.

## Installer et mettre à jour le jeu

Les joueurs ont le jeu en **lecture seule**. Seule l'appli **FFXIV - Maintenance** peut l'écrire :

```bash
sudo ./ffclavicule maintenance on    # l'appli apparaît dans Moonlight
```

Lance-la depuis Moonlight et connecte-toi : XIVLauncher télécharge le jeu (la première fois) ou les correctifs. Quand c'est fini :

```bash
sudo ./ffclavicule maintenance off
```

À chaque nouveau correctif de Square Enix, refais ces étapes avant que les joueurs ne se reconnectent. Tant que le jeu partagé n'est pas à jour, XIVLauncher essaie d'installer le correctif dans la session du joueur et échoue (le jeu y est en lecture seule) : le joueur doit attendre la maintenance. Personne ne doit jouer pendant une mise à jour.

## Jouer hors de chez soi

Moonlight a besoin de joindre ces ports du serveur : TCP 47984, 47989, 48010 et UDP 47999, 48100, 48200. Deux possibilités :

- **VPN** (recommandé) : [Tailscale](https://tailscale.com) ou WireGuard sur le serveur et les appareils, rien à ouvrir sur la box ;
- **redirection de ports** sur la box ou le pare-feu du serveur.

## Commandes

| Commande | Effet |
|---|---|
| `sudo ./ffclavicule setup [--nvidia]` | Installation complète (une fois) |
| `sudo ./ffclavicule pair <PIN> --player <nom> [--ip <ip>]` | Appaire un appareil Moonlight pour un joueur |
| `sudo ./ffclavicule players` | Liste les appareils et leur joueur |
| `sudo ./ffclavicule assign <appareil> <nom>` | Rattache un appareil à un joueur |
| `sudo ./ffclavicule unpair <appareil>` | Retire un appareil (les données du joueur restent) |
| `sudo ./ffclavicule maintenance on\|off` | Affiche ou retire l'appli de mise à jour du jeu |
| `sudo ./ffclavicule status` | Version du jeu, mode maintenance, sessions en cours |
| `sudo ./ffclavicule apply` | Réapplique `.env` (redémarre Wolf) |
| `sudo ./ffclavicule build` | Reconstruit l'image de session |
| `sudo ./ffclavicule start` / `stop` | Démarre ou arrête Wolf |

`apply` et `maintenance` redémarrent Wolf : ils refusent s'il y a des sessions en cours, sauf avec `--force`.

## Réglages (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `FFCLAVICULE_DATA` | `/srv/ffclavicule` | Dossier du jeu partagé et des données des joueurs |
| `FFCLAVICULE_NAME` | `ffclavicule` | Nom du serveur dans Moonlight |
| `KEYBOARD_LAYOUT` | `fr` | Disposition clavier dans les sessions |
| `FFXIV_LANGUAGE` | `French` | Langue par défaut du jeu (chaque joueur peut la changer) |
| `XL_SECRET_PROVIDER` | `NONE` | `NONE` : mot de passe jamais enregistré. `FILE` : enregistré **en clair** dans le dossier du joueur, lisible par l'administrateur du serveur |
| `FFXIV_IMAGE`, `WOLF_IMAGE` | | Images Docker utilisées |

## Limites

- **Comptes Steam** : un compte FFXIV acheté sur Steam demande le client Steam pour se connecter, absent des sessions. Seuls les comptes Square Enix classiques sont pris en charge.
- **Mises à jour manuelles** : elles passent par le mode maintenance (voir plus haut).
- **NVIDIA grand public** : le pilote limite le nombre d'encodages vidéo simultanés, donc le nombre de joueurs en même temps. Intel et AMD n'ont pas cette limite.

## Règles Square Enix

- Chaque joueur se connecte avec **son propre compte** et son propre abonnement. Ne partage jamais un compte entre plusieurs personnes : c'est interdit par le contrat d'utilisation.
- Le serveur télécharge le jeu depuis les serveurs officiels via XIVLauncher : ce dépôt ne contient et ne redistribue aucun fichier du jeu.
- XIVLauncher et son module Dalamud sont des outils tiers, non approuvés par Square Enix. Dalamud peut être désactivé dans les réglages de XIVLauncher.
- Ce projet est fait pour un usage privé (amis, famille). Proposer un service public ou payant de jeu en streaming demanderait un accord avec Square Enix.

## Développement

```bash
python3 -m unittest discover -s tests    # tests de l'outil ffclavicule
```

| Fichier | Contenu |
|---|---|
| `ffclavicule` | Outil d'administration (Python, sans dépendance) |
| `docker-compose.yml`, `docker-compose.nvidia.yml` | Service Wolf |
| `image/` | Image d'une session : base Games on Whales + XIVLauncher.Core compilé depuis les sources |
| `tests/` | Tests de l'outil, dont un faux serveur Wolf pour l'appairage |

## Ancienne version

Les dossiers `scripts/` et `config/` contiennent la première version du projet : streamer FFXIV depuis **son propre PC Windows** vers un navigateur (Sunshine + Moonlight Web Stream + Tailscale). Ils ne servent pas au serveur décrit ici.
