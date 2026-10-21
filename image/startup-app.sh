#!/bin/bash
# Lancé par l'image Games on Whales, sous l'utilisateur "retro", au début de chaque session.
# $HOME est le dossier persistant du joueur (réglages XIVLauncher, Wine, Dalamud).
#
# FFCLAVICULE_MODE :
#   play        jeu partagé en lecture seule (sessions des joueurs)
#   maintenance jeu partagé en écriture : installation et mises à jour
set -e

source /opt/gow/bash-lib/utils.sh
source /opt/gow/launch-comp.sh

MODE="${FFCLAVICULE_MODE:-play}"
GAME="${FFXIV_GAME_PATH:-/ffxiv}"
XL="$HOME/.xlcore"
INI="$XL/launcher.ini"

mkdir -p "$XL/logs" "$HOME/.cache/dxvk"
touch "$INI"

# Affiche un message dans le flux puis termine la session.
# launcher() recopie ses arguments dans la config de sway sans guillemets :
# le texte passe donc par une variable d'environnement.
show_error() {
  gow_log "[ffclavicule] $1"
  export FFCLAVICULE_ERROR="$1"
  launcher /opt/ffclavicule/show-error.sh
  exit 1
}

# Ecrit "clé=valeur" dans launcher.ini (remplace la valeur si la clé existe déjà).
ini_set() {
  local tmp
  tmp="$(mktemp)"
  grep -v "^$1=" "$INI" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  mv "$tmp" "$INI"
}

# Ecrit la valeur seulement si le joueur ne l'a jamais réglée.
ini_default() {
  grep -q "^$1=" "$INI" || printf '%s=%s\n' "$1" "$2" >> "$INI"
}

# Toujours le jeu partagé du serveur, même si le joueur a changé le chemin.
ini_set GamePath "$GAME"
# Le jeu se met à jour en mode maintenance uniquement : pas de cache UID ni de réparation côté joueur.
ini_set IsUidCacheEnabled false
# Pas d'assistant de premier lancement : le chemin du jeu est déjà réglé.
ini_default CompletedFts true
ini_default ClientLanguage "${FFXIV_LANGUAGE:-French}"

# Pas de client Steam dans la session : connexion avec un compte Square Enix.
export XL_USE_STEAM=0
# Où XIVLauncher garde (ou non) les mots de passe : NONE (défaut) ou FILE.
export XL_SECRET_PROVIDER="${XL_SECRET_PROVIDER:-NONE}"
# DXVK écrit par défaut à côté de l'exécutable du jeu, qui est en lecture seule.
export DXVK_STATE_CACHE_PATH="$HOME/.cache/dxvk"
export DXVK_LOG_PATH="$XL/logs"

if [ "$MODE" = "maintenance" ]; then
  if ! touch "$GAME/.ffclavicule-write-test" 2>/dev/null; then
    show_error "Le dossier du jeu n'est pas accessible en écriture.
Vérifie les droits du dossier game/ sur le serveur (il doit appartenir à l'utilisateur 1000)."
  fi
  rm -f "$GAME/.ffclavicule-write-test"
  gow_log "[ffclavicule] Mode maintenance : installation et mises à jour du jeu partagé"
elif [ ! -f "$GAME/game/ffxivgame.ver" ]; then
  show_error "FINAL FANTASY XIV n'est pas encore installé sur le serveur.
Demande à l'administrateur de lancer « FFXIV - Maintenance »."
fi

gow_log "[ffclavicule] Démarrage de XIVLauncher (mode $MODE)"
launcher /opt/xlcore/XIVLauncher.Core
