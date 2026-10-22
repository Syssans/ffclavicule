// Configuration Metro : celle d'Expo, plus un correctif pour three.js.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Sur iOS et Android, Metro choisit la version « require » de three, qui n'est plus qu'une passerelle
// vers la version ES et appelle process.emitWarning (absent de React Native) : plantage au chargement.
// On charge toujours la version ES, la même pour l'appli, react-three-fiber et les modules three/examples.
const THREE_ESM = path.join(__dirname, 'node_modules/three/build/three.module.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: THREE_ESM };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
