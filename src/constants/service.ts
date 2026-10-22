/**
 * Adresse du service Clavicule Sync (dossier server/), qui stocke les modèles 3D envoyés par le plugin.
 * À renseigner une fois le service déployé ; EXPO_PUBLIC_SYNC_URL la remplace (développement : http://localhost:8787).
 * Vide : la vue 3D est simplement désactivée.
 */
const DEPLOYED_SYNC_URL = '';

export const SYNC_URL = (process.env.EXPO_PUBLIC_SYNC_URL || DEPLOYED_SYNC_URL).replace(/\/+$/, '');
