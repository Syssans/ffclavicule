/**
 * Données privées d'un personnage (inventaire, servants, courrier), envoyées par le plugin Dalamud.
 * Lisibles seulement par un téléphone associé avec le code affiché dans /clavicule.
 */
import { Platform } from 'react-native';

import { ApiError, request } from '@/api/http';
import { SYNC_URL } from '@/constants/service';
import type { DutyProgress } from '@/shared/today';

const SOURCE = 'Clavicule Sync';

export interface ItemStack {
  id: number;
  qty: number;
  hq: boolean;
}

export interface ItemGroup {
  key: string;
  label: string;
  updatedAt: string;
  items: ItemStack[];
}

export interface MarketListing extends ItemStack {
  price: number;
}

export interface RetainerInfo {
  id: string;
  name: string;
  classJob: number;
  level: number;
  gil: number;
  itemCount: number;
  marketItemCount: number;
  town: number;
  ventureId: number;
  /** Fin de la mission (secondes Unix), 0 si aucune. */
  ventureComplete: number;
  /** Dernière fois que son inventaire a été vu à la sonnette. */
  seenAt?: string;
  items?: ItemStack[];
  crystals?: ItemStack[];
  market?: MarketListing[];
}

export interface Letter {
  sender: string;
  /** Secondes Unix. */
  timestamp: number;
  preview: string;
  read: boolean;
  gil: number;
  attachments: ItemStack[];
}

/** Élément possédé d'une collection : identifiant dans la feuille du jeu, nom, numéro d'icône. */
export interface CollectionEntry {
  id: number;
  name: string;
  icon: number;
}

/** Une collection relevée en jeu : total des éléments obtenables et ceux possédés. */
export interface CollectionInfo {
  key: string;
  label: string;
  total: number;
  owned: CollectionEntry[];
}

export interface AchievementSummary {
  updatedAt: string;
  count: number;
  total: number;
  points: number;
  pointsTotal: number;
}

/** Façon d'obtenir un élément de collection (type stable, voir SOURCE_LABELS). */
export interface CatalogSource {
  type: string;
  text: string;
  limited?: boolean;
}

/** Élément d'une collection, possédé ou non, avec l'objet qui le débloque et sa provenance. */
export interface CatalogEntry {
  id: number;
  name: string;
  icon: number;
  item?: number;
  /** L'objet se vend au tableau des ventes. */
  tradeable: boolean;
  sources: CatalogSource[];
}

export interface CatalogCollection {
  key: string;
  label: string;
  items: CatalogEntry[];
}

/** Tout ce qui existe dans chaque collection, tiré des données du jeu par le plugin. */
export interface CollectionCatalog {
  schema: number;
  builtAt: string;
  gameVersion: string;
  collections: CatalogCollection[];
}

export interface PrivateSnapshot {
  schema: number;
  updatedAt: string;
  name: string;
  world: string;
  gil: number;
  currencies: Record<string, number>;
  inventories: ItemGroup[];
  retainers: RetainerInfo[];
  mail?: { updatedAt: string; letters: Letter[] };
  /** Absent avec un plugin antérieur aux collections. */
  collections?: CollectionInfo[];
  /** Absent tant que le jeu n'a pas chargé les hauts faits. */
  achievements?: AchievementSummary;
  /** Tâches du jour et de la semaine (absent avec un plugin plus ancien). */
  duties?: DutyProgress;
}

export interface PrivateLink {
  token: string;
  deviceId: string;
  linkedAt: string;
}

export interface PairResult extends PrivateLink {
  characterId: number;
  name: string | null;
  world: string | null;
}

/** Nom du téléphone, tel que le plugin l'affichera dans la liste des appareils. */
export function deviceLabel(): string {
  return Platform.select({ ios: 'iPhone', android: 'Android', web: 'Navigateur', default: 'Téléphone' });
}

/** Garde les chiffres d'un code saisi (« 123 456 », « 123-456 »…). */
export function normalizeCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, 6);
}

export async function pairDevice(code: string, baseUrl: string = SYNC_URL): Promise<PairResult> {
  const response = await fetch(`${baseUrl}/v1/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: normalizeCode(code), device: deviceLabel() }),
  }).catch((e: unknown) => {
    throw new ApiError('Impossible de joindre le service. Vérifie ta connexion.', SOURCE, undefined, String(e));
  });
  const body = (await response.json().catch(() => ({}))) as Partial<PairResult> & { error?: string };
  if (!response.ok || !body.token || !body.characterId) {
    throw new ApiError(body.error ?? `Association refusée (erreur ${response.status}).`, SOURCE, response.status);
  }
  return {
    characterId: body.characterId,
    name: body.name ?? null,
    world: body.world ?? null,
    token: body.token,
    deviceId: body.deviceId ?? '',
    linkedAt: new Date().toISOString(),
  };
}

/** Données privées ; null si le plugin n'a encore rien envoyé. Erreur 401 : téléphone déconnecté. */
export async function getPrivate(characterId: number, token: string, baseUrl: string = SYNC_URL): Promise<PrivateSnapshot | null> {
  const response = await request(`${baseUrl}/v1/characters/${characterId}/private`, {
    source: SOURCE,
    headers: { Authorization: `Bearer ${token}` },
    allow: [404],
    messages: { 401: 'Ce téléphone n’est plus connecté à ce personnage. Reconnecte-le avec un nouveau code.' },
  });
  if (response.status === 404) return null;
  return (await response.json()) as PrivateSnapshot;
}

/** Catalogue des collections ; null si le plugin ne l'a pas encore envoyé (version antérieure). */
export async function getCatalog(characterId: number, token: string, baseUrl: string = SYNC_URL): Promise<CollectionCatalog | null> {
  const response = await request(`${baseUrl}/v1/characters/${characterId}/catalog`, {
    source: SOURCE,
    headers: { Authorization: `Bearer ${token}` },
    allow: [404],
    timeoutMs: 30000,
    messages: { 401: 'Ce téléphone n’est plus connecté à ce personnage. Reconnecte-le avec un nouveau code.' },
  });
  if (response.status === 404) return null;
  return (await response.json()) as CollectionCatalog;
}

/** Déconnecte ce téléphone (le jeton ne fonctionnera plus). Les erreurs réseau sont ignorées. */
export async function disconnect(characterId: number, token: string, baseUrl: string = SYNC_URL): Promise<void> {
  await fetch(`${baseUrl}/v1/characters/${characterId}/devices/self`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

/** Temps restant avant la fin d'une mission de servant. */
export function ventureStatus(ventureComplete: number, now = Date.now()): { done: boolean; label: string } | null {
  if (!ventureComplete) return null;
  const left = ventureComplete * 1000 - now;
  if (left <= 0) return { done: true, label: 'Mission terminée' };
  const minutes = Math.ceil(left / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { done: false, label: `Retour dans ${h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`}` };
}
