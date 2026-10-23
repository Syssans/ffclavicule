/**
 * Alertes de prix du marché : chaque téléphone enregistre ses alertes (objet, monde ou centre de données,
 * seuil, HQ), et une tâche planifiée vérifie les prix sur Universalis toutes les 10 minutes. Quand une
 * alerte se déclenche, une notification part par le service de notifications d'Expo.
 *
 * Routes (le secret est donné à l'inscription et identifie le téléphone) :
 *   POST   /v1/notify/register   { pushToken }            -> { secret }       (aucune ; tentatives limitées)
 *   PUT    /v1/notify/alerts     { pushToken?, alerts }   enregistre la liste  (secret)
 *   GET    /v1/notify/alerts     liste et état des alertes                     (secret)
 *   POST   /v1/notify/test       notification d'essai                         (secret)
 *   DELETE /v1/notify            oublie ce téléphone                           (secret)
 *   POST   /v1/notify/run        vérification immédiate                       (clé d'admin ; tests)
 */
import { bearer, CORS, error, isAdmin, json, readJson, sha256, writeJson, type Env } from './common';

export const MAX_ALERTS = 1000;
const REGISTER_PER_MINUTE = 10;
/** Universalis accepte jusqu'à 100 objets par requête. */
const ITEMS_PER_REQUEST = 100;
/** Expo accepte jusqu'à 100 notifications par envoi. */
const PUSH_BATCH = 100;
/** Déjà prévenu : on ne repréviens que si le prix s'améliore encore de 5 %. */
const BETTER_BY = 0.05;

export interface Alert {
  id: string;
  itemId: number;
  itemName: string;
  scope: string;
  condition: 'below' | 'above';
  price: number;
  hq: boolean;
  enabled: boolean;
}

interface AlertState {
  /** Condition remplie au dernier passage. */
  triggered: boolean;
  /** Dernier prix annoncé. */
  notifiedPrice?: number;
  notifiedAt?: string;
  /** Dernier prix vu (affiché dans l'appli). */
  lastPrice?: number | null;
  checkedAt?: string;
}

interface DeviceRecord {
  pushToken: string;
  alerts: Alert[];
  state: Record<string, AlertState>;
  createdAt: string;
  /** Expo a répondu que ce téléphone n'existe plus : on arrête d'envoyer. */
  disabled?: boolean;
}

const deviceKey = (hash: string) => `notify/${hash}.json`;

function randomSecret(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isPushToken(value: unknown): value is string {
  return typeof value === 'string' && /^Expo(nent)?PushToken\[[^\]]{8,200}\]$/.test(value);
}

/** Vérifie et nettoie une alerte venue de l'appli. */
export function parseAlert(raw: unknown): Alert | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const id = typeof a.id === 'string' ? a.id.slice(0, 40) : '';
  const itemId = Number(a.itemId);
  const price = Number(a.price);
  const scope = typeof a.scope === 'string' ? a.scope.trim().slice(0, 40) : '';
  if (!id || !Number.isInteger(itemId) || itemId <= 0 || !Number.isFinite(price) || price <= 0 || !/^[\p{L}\p{N} '-]+$/u.test(scope)) return null;
  return {
    id,
    itemId,
    itemName: typeof a.itemName === 'string' ? a.itemName.slice(0, 80) : `Objet ${itemId}`,
    scope,
    condition: a.condition === 'above' ? 'above' : 'below',
    price: Math.round(price),
    hq: a.hq === true,
    enabled: a.enabled !== false,
  };
}

async function deviceOf(request: Request, env: Env): Promise<{ key: string; record: DeviceRecord } | null> {
  const secret = bearer(request);
  if (!secret || secret.length < 32) return null;
  const key = deviceKey(await sha256(secret));
  const record = await readJson<DeviceRecord>(env, key);
  return record ? { key, record } : null;
}

async function tooManyRegistrations(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const key = `ratelimit/notify/${ip}/${Math.floor(Date.now() / 60_000)}`;
  const count = (await readJson<{ count: number }>(env, key))?.count ?? 0;
  if (count >= REGISTER_PER_MINUTE) return true;
  await writeJson(env, key, { count: count + 1 });
  return false;
}

async function register(request: Request, env: Env): Promise<Response> {
  if (await tooManyRegistrations(request, env)) return error(429, 'Trop d’essais : patiente une minute.', 'rate-limited');
  const body = (await request.json().catch(() => ({}))) as { pushToken?: unknown };
  if (!isPushToken(body.pushToken)) return error(400, 'Jeton de notification invalide.', 'bad-token');
  const secret = randomSecret();
  const record: DeviceRecord = { pushToken: body.pushToken, alerts: [], state: {}, createdAt: new Date().toISOString() };
  await writeJson(env, deviceKey(await sha256(secret)), record);
  return json({ secret }, 201);
}

async function putAlerts(request: Request, env: Env): Promise<Response> {
  const found = await deviceOf(request, env);
  if (!found) return error(401, 'Téléphone inconnu : réactive les alertes.', 'unknown-device');
  const body = (await request.json().catch(() => null)) as { pushToken?: unknown; alerts?: unknown } | null;
  if (!body || !Array.isArray(body.alerts)) return error(400, 'Liste d’alertes attendue.', 'bad-json');
  if (body.alerts.length > MAX_ALERTS) return error(413, `${MAX_ALERTS} alertes au plus.`, 'too-many');
  const alerts = body.alerts.map(parseAlert);
  if (alerts.some((a) => a === null)) return error(400, 'Une alerte est incomplète (objet, serveur ou prix).', 'bad-alert');
  const record = found.record;
  const kept = alerts as Alert[];
  // L'état d'une alerte survit à sa modification, sauf si le seuil ou le serveur a changé.
  const state: Record<string, AlertState> = {};
  for (const a of kept) {
    const before = record.alerts.find((b) => b.id === a.id);
    const same = before && before.price === a.price && before.scope === a.scope && before.condition === a.condition && before.hq === a.hq;
    state[a.id] = same ? (record.state[a.id] ?? { triggered: false }) : { triggered: false };
  }
  const next: DeviceRecord = { ...record, alerts: kept, state, disabled: false };
  if (isPushToken(body.pushToken)) next.pushToken = body.pushToken;
  await writeJson(env, found.key, next);
  return json({ ok: true, alerts: kept.length });
}

async function getAlerts(request: Request, env: Env): Promise<Response> {
  const found = await deviceOf(request, env);
  if (!found) return error(401, 'Téléphone inconnu : réactive les alertes.', 'unknown-device');
  return json({ alerts: found.record.alerts, state: found.record.state, disabled: Boolean(found.record.disabled) });
}

async function forget(request: Request, env: Env): Promise<Response> {
  const found = await deviceOf(request, env);
  if (!found) return error(401, 'Téléphone inconnu.', 'unknown-device');
  await env.MODELS.delete(found.key);
  return new Response(null, { status: 204, headers: CORS });
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, unknown>;
}

/** Envoie des notifications par Expo ; rend les jetons que Expo dit périmés. */
async function sendPush(env: Env, messages: PushMessage[]): Promise<Set<string>> {
  const dead = new Set<string>();
  const url = env.EXPO_PUSH_URL ?? 'https://exp.host/--/api/v2/push/send';
  for (let i = 0; i < messages.length; i += PUSH_BATCH) {
    const batch = messages.slice(i, i + PUSH_BATCH);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    }).catch(() => null);
    if (!response?.ok) continue;
    const result = (await response.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    result?.data?.forEach((ticket, j) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') dead.add(batch[j].to);
    });
  }
  return dead;
}

async function testPush(request: Request, env: Env): Promise<Response> {
  const found = await deviceOf(request, env);
  if (!found) return error(401, 'Téléphone inconnu : réactive les alertes.', 'unknown-device');
  const dead = await sendPush(env, [
    { to: found.record.pushToken, title: 'Clavicule', body: 'Les alertes du marché sont prêtes.', sound: 'default', data: {} },
  ]);
  if (dead.size) return error(410, 'Ce téléphone ne reçoit plus les notifications : réactive les alertes.', 'unregistered');
  return json({ ok: true });
}

interface MarketPrice {
  min: number | null;
  minHq: number | null;
  world: string | null;
}

/** Prix minimum de plusieurs objets sur un monde, un centre de données ou une région. */
async function fetchPrices(env: Env, scope: string, itemIds: number[]): Promise<Map<number, MarketPrice>> {
  const prices = new Map<number, MarketPrice>();
  const base = env.UNIVERSALIS_URL ?? 'https://universalis.app';
  for (let i = 0; i < itemIds.length; i += ITEMS_PER_REQUEST) {
    const chunk = itemIds.slice(i, i + ITEMS_PER_REQUEST);
    const url = `${base}/api/v2/${encodeURIComponent(scope)}/${chunk.join(',')}?listings=1&entries=0`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Clavicule (alertes de prix)' } }).catch(() => null);
    if (!response?.ok) continue;
    type Market = { itemID: number; minPrice?: number; minPriceHQ?: number; listings?: { worldName?: string }[]; worldName?: string };
    const body = (await response.json().catch(() => null)) as (Market & { items?: Record<string, Market> }) | null;
    if (!body) continue;
    const markets: Market[] = chunk.length === 1 ? [body] : Object.values(body.items ?? {});
    for (const m of markets) {
      prices.set(m.itemID, {
        min: m.minPrice && m.minPrice > 0 ? m.minPrice : null,
        minHq: m.minPriceHQ && m.minPriceHQ > 0 ? m.minPriceHQ : null,
        world: m.listings?.[0]?.worldName ?? m.worldName ?? null,
      });
    }
  }
  return prices;
}

function formatGil(value: number): string {
  return `${value.toLocaleString('fr-FR').replace(/ /g, ' ')} gils`;
}

/** Décide s'il faut prévenir, et met à jour l'état de l'alerte. */
export function evaluate(alert: Alert, price: number | null, state: AlertState, now: string): { notify: boolean; state: AlertState } {
  const met = price !== null && (alert.condition === 'below' ? price <= alert.price : price >= alert.price);
  const next: AlertState = { ...state, lastPrice: price, checkedAt: now };
  if (!met) return { notify: false, state: { ...next, triggered: false } };
  const improved =
    state.notifiedPrice === undefined ||
    (alert.condition === 'below' ? price! <= state.notifiedPrice * (1 - BETTER_BY) : price! >= state.notifiedPrice * (1 + BETTER_BY));
  const notify = !state.triggered || improved;
  return { notify, state: { ...next, triggered: true, ...(notify ? { notifiedPrice: price!, notifiedAt: now } : {}) } };
}

/** Vérifie toutes les alertes de tous les téléphones (tâche planifiée). */
export async function runAlerts(env: Env): Promise<{ devices: number; checked: number; sent: number }> {
  const devices: { key: string; record: DeviceRecord }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.MODELS.list({ prefix: 'notify/', cursor });
    for (const object of page.objects) {
      const record = await readJson<DeviceRecord>(env, object.key);
      if (record && !record.disabled && record.alerts.some((a) => a.enabled)) devices.push({ key: object.key, record });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  // Une requête Universalis par serveur et par paquet de 100 objets, pour tous les téléphones à la fois.
  const byScope = new Map<string, Set<number>>();
  for (const { record } of devices) {
    for (const a of record.alerts) if (a.enabled) (byScope.get(a.scope) ?? byScope.set(a.scope, new Set()).get(a.scope)!).add(a.itemId);
  }
  const prices = new Map<string, Map<number, MarketPrice>>();
  for (const [scope, ids] of byScope) prices.set(scope, await fetchPrices(env, scope, [...ids]));

  const now = new Date().toISOString();
  const messages: PushMessage[] = [];
  const changed: { key: string; record: DeviceRecord }[] = [];
  let checked = 0;
  for (const device of devices) {
    let dirty = false;
    for (const a of device.record.alerts) {
      if (!a.enabled) continue;
      const market = prices.get(a.scope)?.get(a.itemId);
      if (!market) continue;
      checked++;
      const price = a.hq ? market.minHq : market.min;
      const { notify, state } = evaluate(a, price, device.record.state[a.id] ?? { triggered: false }, now);
      device.record.state[a.id] = state;
      dirty = true;
      if (notify && price !== null) {
        const where = !a.hq && market.world && market.world !== a.scope ? `${market.world} (${a.scope})` : a.scope;
        messages.push({
          to: device.record.pushToken,
          title: `${a.itemName}${a.hq ? ' HQ' : ''}`,
          body:
            a.condition === 'below'
              ? `${formatGil(price)} sur ${where} : sous ton seuil de ${formatGil(a.price)}.`
              : `${formatGil(price)} sur ${where} : au-dessus de ton seuil de ${formatGil(a.price)}.`,
          sound: 'default',
          data: { itemId: a.itemId, url: `/item/${a.itemId}` },
        });
      }
    }
    if (dirty) changed.push(device);
  }

  const dead = await sendPush(env, messages);
  for (const device of changed) {
    if (dead.has(device.record.pushToken)) device.record.disabled = true;
    await writeJson(env, device.key, device.record);
  }
  return { devices: devices.length, checked, sent: messages.length - [...dead].length };
}

/** Routes des alertes ; null si la requête ne les concerne pas. */
export async function handleNotify(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/v1/notify')) return null;
  const route = `${request.method} ${url.pathname}`;
  switch (route) {
    case 'POST /v1/notify/register':
      return register(request, env);
    case 'PUT /v1/notify/alerts':
      return putAlerts(request, env);
    case 'GET /v1/notify/alerts':
      return getAlerts(request, env);
    case 'POST /v1/notify/test':
      return testPush(request, env);
    case 'DELETE /v1/notify':
      return forget(request, env);
    case 'POST /v1/notify/run':
      if (!isAdmin(request, env)) return error(403, 'Réservé à l’administration.', 'forbidden');
      return json(await runAlerts(env));
    default:
      return error(404, 'Route inconnue.', 'not-found');
  }
}
