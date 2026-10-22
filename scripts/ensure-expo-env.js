// Crée expo-env.d.ts (normalement généré par « expo start ») pour pouvoir vérifier les types sans lancer l'appli.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'expo-env.d.ts');
if (!fs.existsSync(file)) {
  fs.writeFileSync(file, '/// <reference types="expo/types" />\n\n// NOTE: This file should not be edited and should be in your git ignore\n');
}
