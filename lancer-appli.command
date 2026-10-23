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
