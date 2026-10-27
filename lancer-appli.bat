@echo off
rem Double-clic dans l'Explorateur Windows : met a jour Clavicule puis lance le serveur pour Expo Go.
rem (Equivalent Windows de lancer-appli.command.) Il faut Git et Node.js installes.
chcp 65001 >nul
cd /d "%~dp0"

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Ce dossier n'est pas relie a GitHub ^(il n'a pas de dossier cache .git^) : il ne peut pas se mettre a jour.
  echo Recupere le projet relie a GitHub avec :
  echo   git clone -b claude/inspiring-clarke-gskpec https://github.com/Syssans/ffclavicule.git
  goto erreur
)

echo Mise a jour du code...
rem package-lock.json est reecrit par npm sur chaque ordinateur : on reprend toujours celui du depot.
git checkout -- package-lock.json 2>nul
git pull || goto erreur

echo Mise a jour des bibliotheques...
call npm install --no-audit --no-fund || goto erreur
git checkout -- package-lock.json 2>nul

echo.
echo Scanne le QR code avec l'appareil photo de ton iPhone.
echo Si le telephone ne trouve pas le serveur, ferme cette fenetre et lance plutot : npx expo start --tunnel
call npx expo start --clear
goto :eof

:erreur
echo.
echo Une etape a echoue : copie le message ci-dessus et envoie-le a Claude.
pause
exit /b 1
