/**
 * Données privées d'un personnage (inventaire, servants, courrier), envoyées par le plugin
 * et lisibles seulement par les téléphones que le joueur a associés.
 *
 * Association, sans mot de passe :
 *   1. le plugin (qui a le secret du personnage) demande un code à 6 chiffres, valable 10 minutes ;
 *   2. l'appli envoie ce code et reçoit un jeton propre au téléphone ;
 *   3. le plugin peut voir et révoquer les téléphones associés ; l'appli peut se déconnecter.
 *
 * Routes :
 *   PUT    /v1/characters/:id/private              envoi des données (JSON)          (secret du personnage)
 *   GET    /v1/characters/:id/private              lecture des données (ETag, 304)   (jeton du téléphone)
 *   PUT    /v1/characters/:id/catalog              catalogue des collections (JSON)  (secret du personnage)
 *   GET    /v1/characters/:id/catalog              lecture du catalogue (ETag, 304)  (jeton du téléphone)
 *   POST   /v1/characters/:id/pairing              nouveau code d'association        (secret du personnage)
 *   GET    /v1/characters/:id/devices              téléphones associés               (secret du personnage)
 *   DELETE /v1/characters/:id/devices/:deviceId    révocation                        (secret, ou jeton du téléphone pour « self »)
 *   POST   /v1/pair                                { code, device } -> jeton         (aucune ; tentatives limitées)
 */
import { bearer, CORS, error, isOwner, json, parseId, readJson, safeEqual, sha256, writeJson, type Env } from './common';

/** Les données privées sont du texte : quelques centaines de Ko au plus. */
export const MAX_PRIVATE_BYTES = 2 * 1024 * 1024;
export const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Tentatives d'association par adresse IP et par minute. */
export const PAIR_ATTEMPTS_PER_MINUTE = 10;
const MAX_DEVICES = 10;
const LAST_SEEN_PRECISION_MS = 60 * 60 * 1000;

interface Pairing {
  characterId: number;
  name: string | null;
  world: string | null;
  expiresAt: string;
}

export interface Device {
  id: string;
  tokenHash: string;
  name: string;
  createdAt: string;
  lastSeen: string;
}

/** Documents privés d'un personnage : données du jeu, et catalogue des collections (envoyé rarement). */
type PrivateDocument = 'private' | 'catalog';
const documentKey = (doc: PrivateDocument, id: number) => (doc === 'private' ? `private/${id}.json` : `catalog/${id}.json`);
const devicesKey = (id: number) => `devices/${id}.json`;
const pairingKey = (code: string) => `pairings/${code}.json`;

function randomToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

async function devicesOf(env: Env, id: number): Promise<Device[]> {
  return (await readJson<{ devices: Device[] }>(env, devicesKey(id)))?.devices ?? [];
}

/** Le téléphone de ce jeton (empreinte) est-il toujours associé au personnage ? */
export async function isPaired(env: Env, id: number, tokenHash: string): Promise<boolean> {
  return (await devicesOf(env, id)).some((d) => safeEqual(d.tokenHash, tokenHash));
}

/** Dernières données privées envoyées par le plugin (pour les rappels du service). */
export async function readPrivate<T>(env: Env, id: number): Promise<T | null> {
  return readJson<T>(env, documentKey('private', id));
}

/** Téléphone associé correspondant au jeton de la requête, s'il y en a un. */
export async function deviceOf(request: Request, env: Env, id: number): Promise<{ device: Device; all: Device[] } | null> {
  const token = bearer(request);
  if (!token) return null;
  const hash = await sha256(token);
  const all = await devicesOf(env, id);
  const device = all.find((d) => safeEqual(d.tokenHash, hash));
  return device ? { device, all } : null;
}

function publicDevice(d: Device) {
  return { id: d.id, name: d.name, createdAt: d.createdAt, lastSeen: d.lastSeen };
}

async function putPrivate(request: Request, env: Env, id: number, doc: PrivateDocument): Promise<Response> {
  if (!(await isOwner(request, env, id))) return error(403, 'Envoie d’abord ton modèle depuis ce PC.', 'claimed');
  const body = await request.text();
  if (body.length > MAX_PRIVATE_BYTES) return error(413, 'Données trop volumineuses.', 'too-large');
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
  } catch {
    return error(400, 'Données illisibles (JSON attendu).', 'bad-json');
  }
  await env.MODELS.put(documentKey(doc, id), body, { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
  return json({ ok: true, devices: (await devicesOf(env, id)).length }, 201);
}

async function getPrivate(request: Request, env: Env, id: number, doc: PrivateDocument): Promise<Response> {
  const found = await deviceOf(request, env, id);
  if (!found) return error(401, 'Ce téléphone n’est pas (ou plus) associé à ce personnage.', 'not-paired');

  // Date de dernière visite, rafraîchie au plus une fois par heure.
  const now = Date.now();
  if (now - Date.parse(found.device.lastSeen) > LAST_SEEN_PRECISION_MS) {
    found.device.lastSeen = new Date(now).toISOString();
    await writeJson(env, devicesKey(id), { devices: found.all });
  }

  const object = await env.MODELS.get(documentKey(doc, id), { onlyIf: request.headers });
  if (!object) return error(404, 'Le plugin n’a pas encore envoyé de données pour ce personnage.', 'not-found');
  const headers = new Headers(CORS);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('Cache-Control', 'private, no-cache');
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { status: 200, headers });
}

async function createPairing(request: Request, env: Env, id: number): Promise<Response> {
  if (!(await isOwner(request, env, id))) return error(403, 'Envoie d’abord ton modèle depuis ce PC.', 'claimed');
  let info: { name?: unknown; world?: unknown } = {};
  try {
    info = (await request.json()) as typeof info;
  } catch {
    // Corps facultatif.
  }
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 64) : null);
  let code = sixDigits();
  for (let i = 0; i < 5 && (await env.MODELS.head(pairingKey(code))); i++) code = sixDigits();
  const pairing: Pairing = {
    characterId: id,
    name: text(info.name),
    world: text(info.world),
    expiresAt: new Date(Date.now() + PAIRING_TTL_MS).toISOString(),
  };
  await writeJson(env, pairingKey(code), pairing);
  return json({ code, expiresAt: pairing.expiresAt }, 201);
}

/** Compte les tentatives d'une adresse sur la minute en cours ; vrai si la limite est dépassée. */
async function tooManyAttempts(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const key = `ratelimit/pair/${ip}/${Math.floor(Date.now() / 60_000)}`;
  const count = (await readJson<{ count: number }>(env, key))?.count ?? 0;
  if (count >= PAIR_ATTEMPTS_PER_MINUTE) return true;
  await writeJson(env, key, { count: count + 1 });
  return false;
}

async function pair(request: Request, env: Env): Promise<Response> {
  if (await tooManyAttempts(request, env)) {
    return error(429, 'Trop d’essais : patiente une minute avant de réessayer.', 'rate-limited');
  }
  let body: { code?: unknown; device?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error(400, 'Requête illisible.', 'bad-json');
  }
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
  if (code.length !== 6) return error(400, 'Le code fait 6 chiffres.', 'bad-code');

  const pairing = await readJson<Pairing>(env, pairingKey(code));
  if (!pairing || Date.parse(pairing.expiresAt) < Date.now()) {
    return error(404, 'Code inconnu ou expiré : affiche un nouveau code dans /clavicule.', 'bad-code');
  }
  // Un code ne sert qu'une fois.
  await env.MODELS.delete(pairingKey(code));

  const id = pairing.characterId;
  const token = randomToken();
  const now = new Date().toISOString();
  const name = typeof body.device === 'string' && body.device.trim() ? body.device.trim().slice(0, 40) : 'Téléphone';
  const device: Device = { id: randomToken(9), tokenHash: await sha256(token), name, createdAt: now, lastSeen: now };
  const devices = [...(await devicesOf(env, id)), device].slice(-MAX_DEVICES);
  await writeJson(env, devicesKey(id), { devices });
  return json({ characterId: id, name: pairing.name, world: pairing.world, token, deviceId: device.id }, 201);
}

async function listDevices(request: Request, env: Env, id: number): Promise<Response> {
  if (!(await isOwner(request, env, id))) return error(403, 'Seul l’ordinateur lié au personnage peut voir ses téléphones.', 'claimed');
  return json({ devices: (await devicesOf(env, id)).map(publicDevice) });
}

async function revokeDevice(request: Request, env: Env, id: number, deviceId: string): Promise<Response> {
  let devices: Device[];
  let target: string;
  if (deviceId === 'self') {
    const found = await deviceOf(request, env, id);
    if (!found) return error(401, 'Ce téléphone n’est pas associé.', 'not-paired');
    devices = found.all;
    target = found.device.id;
  } else {
    if (!(await isOwner(request, env, id))) return error(403, 'Seul l’ordinateur lié au personnage peut retirer un téléphone.', 'claimed');
    devices = await devicesOf(env, id);
    target = deviceId;
  }
  const remaining = devices.filter((d) => d.id !== target);
  if (remaining.length === devices.length) return error(404, 'Téléphone inconnu.', 'not-found');
  await writeJson(env, devicesKey(id), { devices: remaining });
  return new Response(null, { status: 204, headers: CORS });
}

/** Routes des données privées ; null si la requête ne les concerne pas. */
export async function handlePrivate(request: Request, env: Env, url: URL): Promise<Response | null> {
  const method = request.method;
  if (url.pathname === '/v1/pair') return method === 'POST' ? pair(request, env) : error(405, 'Méthode non autorisée.', 'method');

  const match = /^\/v1\/characters\/([^/]+)\/(private|catalog|pairing|devices)(?:\/([A-Za-z0-9_-]{1,32}))?$/.exec(url.pathname);
  if (!match) return null;
  const id = parseId(match[1]);
  if (id === null) return error(400, 'Identifiant de personnage invalide.', 'bad-id');
  const [, , route, sub] = match;

  if ((route === 'private' || route === 'catalog') && !sub) {
    if (method === 'PUT') return putPrivate(request, env, id, route);
    if (method === 'GET' || method === 'HEAD') return getPrivate(request, env, id, route);
  }
  if (route === 'pairing' && !sub && method === 'POST') return createPairing(request, env, id);
  if (route === 'devices' && !sub && method === 'GET') return listDevices(request, env, id);
  if (route === 'devices' && sub && method === 'DELETE') return revokeDevice(request, env, id, sub);
  return error(405, 'Méthode non autorisée.', 'method');
}
