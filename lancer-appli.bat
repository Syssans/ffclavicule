@echo off
REM Double-clic : met a jour Clavicule puis lance le serveur pour Expo Go.
cd /d "%~dp0"
echo Mise a jour du code...
git pull
if errorlevel 1 goto erreur
echo Mise a jour des bibliotheques...
call npm install --no-audit --no-fund
if errorlevel 1 goto erreur
echo.
echo Scanne le QR code avec l appareil photo de ton iPhone.
call npx expo start --clear
goto fin
:erreur
echo.
echo Une etape a echoue : copie le message ci-dessus et envoie-le a Claude.
:fin
pause
