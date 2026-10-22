/**
 * Logique du service (séparée de src/index.ts : un Worker ne peut exporter que ses gestionnaires).
 *
 * Clavicule Sync : stockage des modèles 3D des personnages, sur Cloudflare (Worker + R2).
 *
 * - Le plugin Dalamud envoie le modèle (.glb) d'un personnage avec une clé d'écriture personnelle.
 * - L'appli lit les modèles avec la clé de lecture du groupe d'amis.
 *
 * Routes :
 *   GET  /health
 *   GET  /v1/characters                    liste des personnages qui ont un modèle   (lecture)
 *   GET  /v1/characters/:id/model/info     infos du modèle                           (lecture)
 *   GET  /v1/characters/:id/model          le fichier .glb (ETag, 304)               (lecture)
 *   PUT  /v1/characters/:id/model          envoi du fichier .glb                     (écriture)
 */

export interface Env {
  MODELS: R2Bucket;
  /** Clé de lecture partagée par le groupe (secret Cloudflare). */
  READ_TOKEN: string;
  /** Clés d'écriture, une par personne : {"anton": "…", "amie": "…"} (secret Cloudflare). */
  WRITE_TOKENS: string;
}

export interface ModelInfo {
  characterId: number;
  name: string | null;
  world: string | null;
  /** Empreinte de l'apparence (visage, tenue, teintures) au moment de l'export. */
  appearanceHash: string | null;
  uploadedBy: string | null;
  size: number;
  updatedAt: string;
}

/** Limite d'une requête sur l'offre gratuite de Cloudflare Workers : 100 Mo. */
export const MAX_MODEL_BYTES = 95 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67; // « glTF » en little-endian, début de tout fichier .glb

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, X-Appearance-Hash, X-Character-Name, X-Character-World',
  'Access-Control-Allow-Methods': 'GET, HEAD, PUT, OPTIONS',
  'Access-Control-Expose-Headers': 'ETag, X-Appearance-Hash, Last-Modified',
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...headers },
  });
}

export function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

/** Comparaison en temps constant, pour ne rien révéler des clés par le temps de réponse. */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

function writeTokens(env: Env): Record<string, string> {
  try {
    const parsed = JSON.parse(env.WRITE_TOKENS || '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Nom de la personne propriétaire de la clé d'écriture, ou null. */
function writer(request: Request, env: Env): string | null {
  const token = bearer(request);
  if (!token) return null;
  for (const [name, value] of Object.entries(writeTokens(env))) {
    if (value && safeEqual(token, value)) return name;
  }
  return null;
}

/** Lecture autorisée avec la clé du groupe ou avec n'importe quelle clé d'écriture. */
function canRead(request: Request, env: Env): boolean {
  const token = bearer(request);
  if (!token) return false;
  return (Boolean(env.READ_TOKEN) && safeEqual(token, env.READ_TOKEN)) || writer(request, env) !== null;
}

function modelKey(id: number): string {
  return `models/${id}.glb`;
}

function toInfo(id: number, object: R2Object): ModelInfo {
  const meta = object.customMetadata ?? {};
  return {
    characterId: id,
    name: meta.name ?? null,
    world: meta.world ?? null,
    appearanceHash: meta.appearanceHash ?? null,
    uploadedBy: meta.uploadedBy ?? null,
    size: object.size,
    updatedAt: object.uploaded.toISOString(),
  };
}

function parseId(raw: string): number | null {
  return /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}

/** En-tête facultatif, limité en taille et sans caractères de contrôle. */
function header(request: Request, name: string): string | undefined {
  const raw = request.headers.get(name)?.trim();
  if (!raw) return undefined;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // En-tête mal encodé : on garde le texte brut.
  }
  return value.replace(/[\u0000-\u001f]/g, '').slice(0, 64) || undefined;
}

async function putModel(request: Request, env: Env, id: number): Promise<Response> {
  const name = header(request, 'X-Character-Name');
  const world = header(request, 'X-Character-World');
  const appearanceHash = header(request, 'X-Appearance-Hash');
  const who = writer(request, env);
  if (!who) return error(401, 'Clé d’écriture absente ou invalide.');

  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_MODEL_BYTES) return error(413, `Modèle trop lourd (${declared} octets, maximum ${MAX_MODEL_BYTES}).`);

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return error(400, 'Fichier vide.');
  if (body.byteLength > MAX_MODEL_BYTES) return error(413, 'Modèle trop lourd.');
  if (body.byteLength < 12 || new DataView(body).getUint32(0, true) !== GLB_MAGIC) {
    return error(415, 'Ce n’est pas un fichier .glb (glTF binaire).');
  }

  const object = await env.MODELS.put(modelKey(id), body, {
    httpMetadata: { contentType: 'model/gltf-binary' },
    customMetadata: {
      uploadedBy: who,
      ...(name ? { name } : {}),
      ...(world ? { world } : {}),
      ...(appearanceHash ? { appearanceHash } : {}),
    },
  });
  return json(toInfo(id, object), 201);
}

async function getModel(request: Request, env: Env, id: number): Promise<Response> {
  if (!canRead(request, env)) return error(401, 'Clé de lecture absente ou invalide.');
  const object = await env.MODELS.get(modelKey(id), { onlyIf: request.headers });
  if (!object) return error(404, 'Aucun modèle 3D pour ce personnage.');
  const headers = new Headers(CORS);
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('Cache-Control', 'private, no-cache');
  if (object.customMetadata?.appearanceHash) headers.set('X-Appearance-Hash', object.customMetadata.appearanceHash);
  // Condition If-None-Match remplie : R2 renvoie l'objet sans contenu.
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  return new Response(object.body, { status: 200, headers });
}

async function getInfo(request: Request, env: Env, id: number): Promise<Response> {
  if (!canRead(request, env)) return error(401, 'Clé de lecture absente ou invalide.');
  const object = await env.MODELS.head(modelKey(id));
  if (!object) return error(404, 'Aucun modèle 3D pour ce personnage.');
  return json(toInfo(id, object));
}

async function listModels(request: Request, env: Env): Promise<Response> {
  if (!canRead(request, env)) return error(401, 'Clé de lecture absente ou invalide.');
  const infos: ModelInfo[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.MODELS.list({ prefix: 'models/', cursor, include: ['customMetadata'] });
    for (const object of page.objects) {
      const id = parseId(object.key.slice('models/'.length).replace(/\.glb$/, ''));
      if (id !== null) infos.push(toInfo(id, object));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({ characters: infos });
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/health') return json({ ok: true });
  if (url.pathname === '/v1/characters' && request.method === 'GET') return listModels(request, env);

  const match = /^\/v1\/characters\/([^/]+)\/model(\/info)?$/.exec(url.pathname);
  if (!match) return error(404, 'Route inconnue.');
  const id = parseId(match[1]);
  if (id === null) return error(400, 'Identifiant de personnage invalide.');

  if (match[2]) return request.method === 'GET' ? getInfo(request, env, id) : error(405, 'Méthode non autorisée.');
  if (request.method === 'PUT') return putModel(request, env, id);
  if (request.method === 'GET' || request.method === 'HEAD') return getModel(request, env, id);
  return error(405, 'Méthode non autorisée.');
}
