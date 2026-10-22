/// <reference types="node" />
/**
 * Garde-fou : sur iPhone, la version « require » de three.js plante au chargement
 * (elle appelle process.emitWarning, absent de React Native). Metro doit toujours servir la version ES.
 */
jest.mock('expo/metro-config', () => ({ getDefaultConfig: () => ({ resolver: {} }) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../metro.config.js');

it('Metro charge la version ES de three.js sur toutes les plateformes', () => {
  const fallback = jest.fn(() => ({ type: 'sourceFile', filePath: 'autre' }));
  const context = { resolveRequest: fallback };
  for (const platform of ['ios', 'android', 'web']) {
    const result = config.resolver.resolveRequest(context, 'three', platform);
    expect(result.filePath).toMatch(/node_modules\/three\/build\/three\.module\.js$/);
  }
  expect(config.resolver.resolveRequest(context, 'react', 'ios')).toEqual({ type: 'sourceFile', filePath: 'autre' });
});
