/**
 * ATH du jeu (disposition des éléments, barres d'actions) modifiable depuis l'appli.
 *
 * - Le plugin envoie un relevé de l'ATH (les 4 dispositions et les barres de chaque job).
 * - L'appli, avec le jeton d'un téléphone associé, le lit et dépose des modifications dans une file.
 * - Le plugin relève la file quand le jeu tourne, applique les modifications, puis les acquitte. Si le jeu
 *   est fermé, elles attendent la prochaine connexion.
 *
 * Routes :
 *   PUT    /v1/characters/:id/hud                     relevé de l'ATH (JSON)                       (secret du personnage)
 *   GET    /v1/characters/:id/hud                     lecture du relevé (ETag, 304)                (jeton du téléphone)
 *   GET    /v1/characters/:id/hud/changes             file des modifications (?pending=1)          (secret, ou jeton du téléphone)
 *   POST   /v1/characters/:id/hud/changes             nouvelle modification                        (jeton du téléphone)
 *   POST   /v1/characters/:id/hud/changes/:changeId   résultat { status, message }                 (secret du personnage)
 *   DELETE /v1/characters/:id/hud/changes/:changeId   annule une modification encore en attente    (jeton du téléphone)
 */
import { CORS, error, isOwner, json, parseId, type Env } from './common';
import { deviceOf } from './private';

export const MAX_HUD_BYTES = 2 * 1024 * 1024;
/** Une modification décrit quelques éléments ou quelques cases : quelques Ko. */
export const MAX_CHANGE_BYTES = 64 * 1024;
export const MAX_PENDING_CHANGES = 20;
/** Modifications terminées gardées pour l'historique de l'appli. */
const KEPT_DONE_CHANGES = 20;
export const CHANGE_KINDS = ['layout', 'hotbars', 'activate'] as const;
const DONE_STATUSES = ['applied', 'partial', 'failed'] as const;

type ChangeKind = (typeof CHANGE_KINDS)[number];
type ChangeStatus = 'pending' | 'cancelled' | (typeof DONE_STATUSES)[number];

export interface HudChange {
  id: string;
  kind: ChangeKind;
  createdAt: string;
  device: string;
  status: ChangeStatus;
  message?: string;
  doneAt?: string;
  /** Contenu de la modification, vérifié en détail par le plugin. */
  change: Record<string, unknown>;
}

const hudKey = (id: number) => `hud/${id}.json`;
const changesKey = (id: number) => `hud-changes/${id}.json`;

function changeId(): string {
  const raw = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Lit la file, la modifie et la réécrit si personne ne l'a changée entre-temps (l'appli et le plugin y
 * écrivent tous deux). Rend ce que `edit` a rendu, ou une réponse d'erreur.
 */
async function updateChanges<T>(env: Env, id: number, edit: (changes: HudChange[]) => T | Response): Promise<T | Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const object = await env.MODELS.get(changesKey(id));
    let changes: HudChange[] = [];
    if (object) {
      try {
        changes = ((await object.json()) as { changes: HudChange[] }).changes ?? [];
      } catch {
        changes = [];
      }
    }
    const result = edit(changes);
    if (result instanceof Response) return result;
    const body = JSON.stringify({ changes: trim(changes) });
    const options: R2PutOptions = { httpMetadata: { contentType: 'application/json' } };
    if (object) options.onlyIf = { etagMatches: object.etag };
    if (await env.MODELS.put(changesKey(id), body, options)) return result;
  }
  return error(409, 'La file des modifications change trop vite : réessaie.', 'conflict');
}

/** Garde toutes les modifications en attente et les plus récentes des autres. */
function trim(changes: HudChange[]): HudChange[] {
  const done = changes.filter((c) => c.status !== 'pending');
  const keep = new Set(done.slice(-KEPT_DONE_CHANGES));
  return changes.filter((c) => c.status === 'pending' || keep.has(c));
}

async function putHud(request: Request, env: Env, id: number): Promise<Response> {
  if (!(await isOwner(request, env, id))) return error(403, 'Envoie d’abord ton modèle depuis ce PC.', 'claimed');
  const body = await request.text();
  if (body.length > MAX_HUD_BYTES) return error(413, 'Relevé trop volumineux.', 'too-large');
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
  } catch {
    return error(400, 'Relevé illisible (JSON attendu).', 'bad-json');
  }
  await env.MODELS.put(hudKey(id), body, { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
  return json({ ok: true }, 201);
}

async function getHud(request: Request, env: Env, id: number): Promise<Response> {
  if (!(await deviceOf(request, env, id))) return error(401, 'Ce téléphone n’est pas (ou plus) associé à ce personnage.', 'not-paired');
  const object = await env.MODELS.get(hudKey(id), { onlyIf: request.headers });
  if (!object) return error(404, 'Le plugin n’a pas encore envoyé l’ATH de ce personnage.', 'not-found');
  const headers = new Headers(CORS);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'private, no-cache');
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { status: 200, headers });
}

async function listChanges(request: Request, env: Env, id: number, url: URL): Promise<Response> {
  const allowed = (await isOwner(request, env, id)) || Boolean(await deviceOf(request, env, id));
  if (!allowed) return error(401, 'Ce téléphone n’est pas (ou plus) associé à ce personnage.', 'not-paired');
  const object = await env.MODELS.get(changesKey(id));
  let changes: HudChange[] = [];
  if (object) changes = ((await object.json()) as { changes: HudChange[] }).changes ?? [];
  if (url.searchParams.get('pending') === '1') changes = changes.filter((c) => c.status === 'pending');
  return json({ changes });
}

async function addChange(request: Request, env: Env, id: number): Promise<Response> {
  const found = await deviceOf(request, env, id);
  if (!found) return error(401, 'Ce téléphone n’est pas (ou plus) associé à ce personnage.', 'not-paired');
  const text = await request.text();
  if (text.length > MAX_CHANGE_BYTES) return error(413, 'Modification trop volumineuse.', 'too-large');
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    return error(400, 'Modification illisible (JSON attendu).', 'bad-json');
  }
  const kind = body.kind;
  if (typeof kind !== 'string' || !(CHANGE_KINDS as readonly string[]).includes(kind)) {
    return error(400, 'Type de modification inconnu.', 'bad-change');
  }
  const change: HudChange = {
    id: changeId(),
    kind: kind as ChangeKind,
    createdAt: new Date().toISOString(),
    device: found.device.name,
    status: 'pending',
    change: body,
  };
  const result = await updateChanges(env, id, (changes) => {
    if (changes.filter((c) => c.status === 'pending').length >= MAX_PENDING_CHANGES) {
      return error(429, 'Trop de modifications en attente : lance le jeu pour qu’elles s’appliquent.', 'too-many');
    }
    changes.push(change);
    return change;
  });
  return result instanceof Response ? result : json(result, 201);
}

async function finishChange(request: Request, env: Env, id: number, cid: string): Promise<Response> {
  if (!(await isOwner(request, env, id))) return error(403, 'Seul l’ordinateur lié au personnage peut appliquer les modifications.', 'claimed');
  let body: { status?: unknown; message?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error(400, 'Requête illisible.', 'bad-json');
  }
  const status = body.status;
  if (typeof status !== 'string' || !(DONE_STATUSES as readonly string[]).includes(status)) {
    return error(400, 'Résultat inconnu.', 'bad-status');
  }
  const message = typeof body.message === 'string' ? body.message.slice(0, 500) : undefined;
  const result = await updateChanges(env, id, (changes) => {
    const change = changes.find((c) => c.id === cid);
    if (!change) return error(404, 'Modification inconnue.', 'not-found');
    if (change.status !== 'pending') return change;
    change.status = status as ChangeStatus;
    change.message = message;
    change.doneAt = new Date().toISOString();
    return change;
  });
  return result instanceof Response ? result : json(result);
}

async function cancelChange(request: Request, env: Env, id: number, cid: string): Promise<Response> {
  if (!(await deviceOf(request, env, id))) return error(401, 'Ce téléphone n’est pas (ou plus) associé à ce personnage.', 'not-paired');
  const result = await updateChanges(env, id, (changes) => {
    const change = changes.find((c) => c.id === cid);
    if (!change) return error(404, 'Modification inconnue.', 'not-found');
    if (change.status !== 'pending') return error(409, 'Cette modification a déjà été traitée par le jeu.', 'done');
    change.status = 'cancelled';
    change.doneAt = new Date().toISOString();
    return change;
  });
  return result instanceof Response ? result : new Response(null, { status: 204, headers: CORS });
}

/** Routes de l'ATH ; null si la requête ne les concerne pas. */
export async function handleHud(request: Request, env: Env, url: URL): Promise<Response | null> {
  const match = /^\/v1\/characters\/([^/]+)\/hud(?:\/(changes)(?:\/([A-Za-z0-9_-]{1,32}))?)?$/.exec(url.pathname);
  if (!match) return null;
  const id = parseId(match[1]);
  if (id === null) return error(400, 'Identifiant de personnage invalide.', 'bad-id');
  const [, , changes, cid] = match;
  const method = request.method;

  if (!changes) {
    if (method === 'PUT') return putHud(request, env, id);
    if (method === 'GET' || method === 'HEAD') return getHud(request, env, id);
  } else if (!cid) {
    if (method === 'GET') return listChanges(request, env, id, url);
    if (method === 'POST') return addChange(request, env, id);
  } else {
    if (method === 'POST') return finishChange(request, env, id, cid);
    if (method === 'DELETE') return cancelChange(request, env, id, cid);
  }
  return error(405, 'Méthode non autorisée.', 'method');
}

