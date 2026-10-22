/**
 * Adresse du service Clavicule Sync (dossier server/), qui stocke les modèles 3D envoyés par le plugin.
 * Changer cette adresse coupe les versions déjà installées : la garder stable.
 * EXPO_PUBLIC_SYNC_URL la remplace (développement : http://localhost:8787).
 * Vide : la vue 3D est désactivée.
 */
const DEPLOYED_SYNC_URL = 'https://clavicule-sync.anton-millien.workers.dev';

export const SYNC_URL = (process.env.EXPO_PUBLIC_SYNC_URL || DEPLOYED_SYNC_URL).replace(/\/+$/, '');
