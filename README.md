# ffclavicule

Jouer à **FINAL FANTASY XIV** depuis un navigateur, en streamant **ton propre PC Windows**.

Le jeu tourne normalement sur ton PC, avec ton compte et ta licence. Le navigateur (autre PC, Mac, tablette, téléphone) reçoit seulement l'image et le son, et renvoie clavier, souris et manette.

## Comment ça marche

```
Navigateur ──HTTPS (Tailscale)──▶ Moonlight Web Stream ──▶ Sunshine ──▶ FFXIV
    ▲                                  (sur ton PC)        (capture + encodage)
    └──────────── vidéo / son en WebRTC ◀──────────────────────┘
```

| Outil | Rôle |
|---|---|
| [Sunshine](https://github.com/LizardByte/Sunshine) | Capture l'écran du PC et l'encode avec la carte graphique |
| [Moonlight Web Stream](https://github.com/MrCreativ3001/moonlight-web-stream) (v2.10.0) | Client Moonlight qui affiche le flux Sunshine dans un navigateur, en WebRTC |
| [Tailscale](https://tailscale.com/) | Réseau privé entre tes appareils : accès depuis l'extérieur sans ouvrir de port sur ta box, et HTTPS avec un vrai certificat |

## Installation (une seule fois)

1. Sur ton PC, ouvre PowerShell dans ce dossier et lance :
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
   ```
2. Ouvre `https://localhost:47990`, crée ton identifiant Sunshine.
3. Dans Sunshine, onglet **Applications**, ajoute FFXIV :
   - Launcher Square Enix : `C:\Program Files (x86)\SquareEnix\FINAL FANTASY XIV - A Realm Reborn\boot\ffxivboot.exe`
   - Steam : commande `steam://rungameid/39210`
   - XIVLauncher : `%LOCALAPPDATA%\XIVLauncher\XIVLauncher.exe`
4. Connecte-toi à Tailscale sur le PC, puis sur chaque appareil depuis lequel tu veux jouer (même compte).
5. Dans la [console Tailscale](https://login.tailscale.com/admin/dns), active **MagicDNS** et **HTTPS Certificates**.

## Jouer

1. Sur le PC : `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1`
2. Le script affiche une adresse du type `https://mon-pc.xxxx.ts.net`. Ouvre-la depuis ton autre appareil.
3. Premier lancement : crée ton compte (le premier compte devient administrateur), ajoute l'hôte `localhost`, puis entre le code PIN affiché dans l'onglet **PIN** de Sunshine.
4. Lance FFXIV et joue. Une manette est bien gérée par le jeu et par le navigateur.

## Si l'image ne s'affiche pas

La vidéo passe en WebRTC (UDP, ports 40000 à 40010). Sur Tailscale ça passe presque toujours. Sinon :
- autorise `web-server.exe` et `streamer.exe` dans le pare-feu Windows pour les réseaux privés ;
- consulte la section *Streaming over the Internet* de la [doc Moonlight Web Stream](https://github.com/MrCreativ3001/moonlight-web-stream/tree/v2.10.0#streaming-over-the-internet) (serveur TURN ou transport WebSocket).

## Règles Square Enix

- C'est **ton** jeu, sur **ton** PC, joué par **toi** : le jeu ne voit aucune différence avec une partie normale.
- **Ne partage pas l'accès** à d'autres personnes : ce serait du partage de compte, interdit par le contrat d'utilisation.
- Ce dépôt ne contient et ne modifie aucun fichier du jeu.

## Fichiers

- `scripts/install.ps1` : installe Sunshine, Tailscale et Moonlight Web Stream (dans `%LOCALAPPDATA%\ffclavicule`).
- `scripts/start.ps1` : publie le client web en HTTPS sur Tailscale et le démarre.
- `config/config.example.json` : config du client web (écoute seulement en local, ports WebRTC fixes).
