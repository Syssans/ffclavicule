/** Alertes de prix : inscription du téléphone et liste des alertes auprès du service Clavicule. */
import { ApiError, request } from '@/api/http';
import { SYNC_URL } from '@/constants/service';
import type { PriceAlert } from '@/store/notification-store';

const SOURCE = 'Clavicule Sync';
const UNKNOWN = 'Ce téléphone n’est plus inscrit : réactive les alertes du marché.';

export interface AlertState {
  triggered: boolean;
  lastPrice?: number | null;
  checkedAt?: string;
  notifiedAt?: string;
}

const json = (secret: string | null, body?: unknown) => ({
  headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export async function registerDevice(pushToken: string, baseUrl: string = SYNC_URL): Promise<string> {
  const response = await request(`${baseUrl}/v1/notify/register`, { source: SOURCE, method: 'POST', ...json(null, { pushToken }) });
  const body = (await response.json()) as { secret?: string };
  if (!body.secret) throw new ApiError('Inscription refusée par le service.', SOURCE, response.status);
  return body.secret;
}

/** Envoie toute la liste (le service garde l'état de chaque alerte inchangée). */
export async function uploadAlerts(secret: string, alerts: PriceAlert[], pushToken?: string, baseUrl: string = SYNC_URL): Promise<void> {
  const payload = alerts.map(({ id, itemId, itemName, scope, condition, price, hq, enabled }) => ({ id, itemId, itemName, scope, condition, price, hq, enabled }));
  await request(`${baseUrl}/v1/notify/alerts`, {
    source: SOURCE,
    method: 'PUT',
    ...json(secret, { alerts: payload, pushToken }),
    messages: { 401: UNKNOWN },
  });
}

export async function alertStates(secret: string, baseUrl: string = SYNC_URL): Promise<{ state: Record<string, AlertState>; disabled: boolean }> {
  const response = await request(`${baseUrl}/v1/notify/alerts`, { source: SOURCE, ...json(secret), messages: { 401: UNKNOWN } });
  return (await response.json()) as { state: Record<string, AlertState>; disabled: boolean };
}

export async function sendTestPush(secret: string, baseUrl: string = SYNC_URL): Promise<void> {
  await request(`${baseUrl}/v1/notify/test`, {
    source: SOURCE,
    method: 'POST',
    ...json(secret),
    messages: { 401: UNKNOWN, 410: 'Ce téléphone ne reçoit plus les notifications : réactive les alertes.' },
  });
}

export async function forgetDevice(secret: string, baseUrl: string = SYNC_URL): Promise<void> {
  await request(`${baseUrl}/v1/notify`, { source: SOURCE, method: 'DELETE', ...json(secret), allow: [401] }).catch(() => undefined);
}

export interface TodaySettings {
  characterId: number;
  privateToken: string;
  tracked: string[];
  checked: Record<string, number>;
  daily: boolean;
  weekly: boolean;
  lead: number;
}

/** Rappel « Aujourd'hui » : la liste suivie et les cases cochées, pour que le service prévienne avant la réinitialisation. */
export async function uploadToday(secret: string, settings: TodaySettings | { daily: false; weekly: false }, baseUrl: string = SYNC_URL): Promise<void> {
  await request(`${baseUrl}/v1/notify/today`, {
    source: SOURCE,
    method: 'PUT',
    ...json(secret, settings),
    messages: { 401: UNKNOWN, 403: 'Ce téléphone n’est plus connecté à ce personnage : reconnecte-le depuis sa fiche.' },
  });
}

export interface RetainerAlertUpload {
  characterId: number;
  privateToken: string;
  sold: boolean;
  undercut: number | null;
  stale: number | null;
}

/** Alertes des servants : le service compare les annonces relevées par le plugin au marché. */
export async function uploadRetainerAlerts(secret: string, settings: RetainerAlertUpload | { sold: false }, baseUrl: string = SYNC_URL): Promise<void> {
  await request(`${baseUrl}/v1/notify/retainers`, {
    source: SOURCE,
    method: 'PUT',
    ...json(secret, settings),
    messages: { 401: UNKNOWN, 403: 'Ce téléphone n’est plus connecté à ce personnage : reconnecte-le depuis sa fiche.' },
  });
}
