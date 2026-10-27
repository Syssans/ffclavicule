#!/bin/zsh -il
# Double-clic dans le Finder : met à jour Clavicule puis lance le serveur pour Expo Go.
# (-il : charge ton profil, pour trouver node, npm et git comme dans le Terminal.)
cd "$(dirname "$0")" || exit 1

erreur() {
  echo
  echo "Une étape a échoué : copie le message ci-dessus et envoie-le à Claude."
  read -k 1 "?Appuie sur une touche pour fermer."
  exit 1
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Ce dossier n’est pas relié à GitHub (il n’a pas de dossier caché .git) : il ne peut pas se mettre à jour."
  echo "Il vient sans doute d’un téléchargement ZIP ou d’une copie. Récupère le projet relié à GitHub avec :"
  echo "  git clone -b claude/inspiring-clarke-gskpec https://github.com/Syssans/ffclavicule.git ~/ffclavicule-git"
  echo "puis double-clique sur ~/ffclavicule-git/lancer-appli.command"
  erreur
fi

echo "Mise à jour du code…"
# package-lock.json est réécrit par npm sur chaque ordinateur : on reprend toujours celui du dépôt.
git checkout -- package-lock.json 2>/dev/null
git pull || erreur
echo "Mise à jour des bibliothèques…"
npm install --no-audit --no-fund || erreur
git checkout -- package-lock.json 2>/dev/null
echo
echo "Scanne le QR code avec l’appareil photo de ton iPhone."
npx expo start --clear
