#!/bin/bash
# Fenêtre d'erreur affichée dans le flux. Le texte arrive par $FFCLAVICULE_ERROR.
exec zenity --error --width=500 --title="ffclavicule" --text="${FFCLAVICULE_ERROR:-Erreur inconnue}"
