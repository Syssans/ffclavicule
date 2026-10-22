/**
 * Logique du service (séparée de src/index.ts : un Worker ne peut exporter que ses gestionnaires).
 *
 * Clavicule Sync : modèles 3D des personnages, sur Cloudflare (Worker + R2). Aucune clé à configurer :
 *
 * - Lecture publique : l'apparence d'un personnage est déjà publique en jeu et sur le Lodestone.
 * - Écriture protégée par un secret que le plugin génère seul pour chaque personnage. Le premier envoi
 *   « réclame » le personnage ; ensuite, seul ce secret peut le modifier.
 * - Secret perdu (nouveau PC) : le plugin demande un code, le joueur le colle dans sa présentation Lodestone,
 *   le service le vérifie et accepte le nouveau secret.
 *
 * Routes :
 *   GET    /health
 *   GET    /v1/characters/:id/model/info       infos du modèle
 *   GET    /v1/characters/:id/model            le fichier .glb (ETag, 304)
 *   PUT    /v1/characters/:id/model            envoi du .glb                    (secret du personnage)
 *   DELETE /v1/characters/:id/model            suppression du modèle            (secret, ou clé d'admin)
 *   POST   /v1/characters/:id/claim            demande d'un code Lodestone      (nouveau secret)
 *   POST   /v1/characters/:id/claim/verify     vérification du code             (nouveau secret)
 *   PUT    /v1/characters/:id/debug            diagnostic des couleurs (.zip)   (secret du personnage)
 *   GET    /v1/characters/:id/debug            le diagnostic, pour corriger la cuisson des matériaux
 *
 * Données privées (inventaire, servants, courrier) et association des téléphones : voir src/private.ts.
 */

import {
  CORS,
  error,
  header,
  isAdmin,
  json,
  ownerKey,
  parseId,
  readJson,
  safeEqual,
  secretOf,
  sha256,
  writeJson,
  type Env,
  type Owner,
} from './common';
import { handlePrivate } from './private';

export { error, type Env } from './common';

export interface ModelInfo {
  characterId: number;
  name: string | null;
  world: string | null;
  /** Empreinte de l'apparence (visage, tenue, teintures) au moment de l'export. */
  appearanceHash: string | null;
  size: number;
  updatedAt: string;
}

interface PendingClaim {
  code: string;
  secretHash: string;
  expiresAt: string;
}

/** Un personnage exporté pèse 10 à 20 Mo ; au-delà, c'est anormal. */
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;
/** Délai minimal entre deux envois pour un même personnage. */
export const MIN_UPLOAD_INTERVAL_MS = 30_000;
const CLAIM_TTL_MS = 60 * 60 * 1000;
const GLB_MAGIC = 0x46546c67; // « glTF » en little-endian, début de tout fichier .glb

const modelKey = (id: number) => `models/${id}.glb`;
const debugKey = (id: number) => `debug/${id}.zip`;
/** Le diagnostic contient des aperçus de textures (256 px) : quelques Mo. */
export const MAX_DEBUG_BYTES = 30 * 1024 * 1024;
const claimKey = (id: number) => `claims/${id}.json`;

function toInfo(id: number, object: R2Object): ModelInfo {
  const meta = object.customMetadata ?? {};
  return {
    characterId: id,
    name: meta.name ?? null,
    world: meta.world ?? null,
    appearanceHash: meta.appearanceHash ?? null,
    size: object.size,
    updatedAt: object.uploaded.toISOString(),
  };
}

// ------------------------------------------------------------------ Lodestone

function lodestoneBase(env: Env): string {
  return (env.LODESTONE_URL || 'https://eu.finalfantasyxiv.com').replace(/\/+$/, '');
}

export function lodestoneProfileUrl(env: Env, id: number): string {
  return `${lodestoneBase(env)}/lodestone/character/${id}/`;
}

/** Page de profil Lodestone : texte, null si le personnage n'existe pas, « indisponible » sinon. */
async function fetchProfile(env: Env, id: number): Promise<string | null | 'indisponible'> {
  try {
    const res = await fetch(lodestoneProfileUrl(env, id), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClaviculeSync/1.0)' },
    });
    if (res.status === 404) return null;
    if (!res.ok) return 'indisponible';
    return await res.text();
  } catch {
    return 'indisponible';
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pageMentions(page: string, text: string): boolean {
  return page.includes(text) || page.includes(escapeHtml(text));
}

/** Code à coller dans la présentation : facile à lire, sans caractères ambigus. */
function newCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `CLAVICULE-${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}`;
}

// ------------------------------------------------------------------ routes

async function putModel(request: Request, env: Env, id: number): Promise<Response> {
  const secret = secretOf(request);
  if (!secret) return error(401, 'Secret du personnage absent.', 'unauthorized');

  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_MODEL_BYTES) return error(413, 'Modèle trop lourd.', 'too-large');
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_MODEL_BYTES) return error(413, 'Modèle trop lourd.', 'too-large');
  if (body.byteLength < 12 || new DataView(body).getUint32(0, true) !== GLB_MAGIC) {
    return error(415, 'Ce n’est pas un fichier .glb (glTF binaire).', 'not-glb');
  }

  const name = header(request, 'X-Character-Name');
  const world = header(request, 'X-Character-World');
  const appearanceHash = header(request, 'X-Appearance-Hash');
  const secretHash = await sha256(secret);
  const owner = await readJson<Owner>(env, ownerKey(id));

  if (owner) {
    if (!safeEqual(owner.secretHash, secretHash)) {
      return error(403, 'Ce personnage est déjà lié à un autre ordinateur. Confirme-le avec le code Lodestone.', 'claimed');
    }
  } else {
    // Premier envoi : on vérifie que le personnage existe (et porte ce nom) avant de le lier.
    const page = await fetchProfile(env, id);
    if (page === null) return error(422, 'Personnage introuvable sur le Lodestone.', 'unknown-character');
    if (page !== 'indisponible' && name && !pageMentions(page, name)) {
      return error(422, 'Le nom ne correspond pas à ce personnage sur le Lodestone.', 'unknown-character');
    }
    await writeJson(env, ownerKey(id), { secretHash, claimedAt: new Date().toISOString(), via: 'premier-envoi' } satisfies Owner);
  }

  const previous = await env.MODELS.head(modelKey(id));
  if (previous && Date.now() - previous.uploaded.getTime() < MIN_UPLOAD_INTERVAL_MS) {
    return error(429, 'Envois trop rapprochés, réessaie dans une minute.', 'rate-limited');
  }

  const object = await env.MODELS.put(modelKey(id), body, {
    httpMetadata: { contentType: 'model/gltf-binary' },
    customMetadata: {
      ...(name ? { name } : {}),
      ...(world ? { world } : {}),
      ...(appearanceHash ? { appearanceHash } : {}),
    },
  });
  return json(toInfo(id, object), 201);
}

async function deleteModel(request: Request, env: Env, id: number): Promise<Response> {
  if (!isAdmin(request, env)) {
    const secret = secretOf(request);
    const owner = await readJson<Owner>(env, ownerKey(id));
    if (!secret || !owner || !safeEqual(owner.secretHash, await sha256(secret))) {
      return error(403, 'Seul l’ordinateur lié à ce personnage peut supprimer son modèle.', 'claimed');
    }
  }
  await env.MODELS.delete(modelKey(id));
  // L'admin libère aussi le personnage (en cas d'abus).
  if (isAdmin(request, env)) await env.MODELS.delete([ownerKey(id), claimKey(id)]);
  return new Response(null, { status: 204, headers: CORS });
}

async function startClaim(request: Request, env: Env, id: number): Promise<Response> {
  const secret = secretOf(request);
  if (!secret) return error(401, 'Secret du personnage absent.', 'unauthorized');
  const claim: PendingClaim = {
    code: newCode(),
    secretHash: await sha256(secret),
    expiresAt: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
  };
  await writeJson(env, claimKey(id), claim);
  return json({ code: claim.code, expiresAt: claim.expiresAt, profileUrl: lodestoneProfileUrl(env, id) });
}

async function verifyClaim(request: Request, env: Env, id: number): Promise<Response> {
  const secret = secretOf(request);
  if (!secret) return error(401, 'Secret du personnage absent.', 'unauthorized');
  const claim = await readJson<PendingClaim>(env, claimKey(id));
  const secretHash = await sha256(secret);
  if (!claim || !safeEqual(claim.secretHash, secretHash) || Date.parse(claim.expiresAt) < Date.now()) {
    return error(404, 'Aucune demande en cours (ou elle a expiré) : demande un nouveau code.', 'no-claim');
  }
  const page = await fetchProfile(env, id);
  if (page === null) return error(422, 'Personnage introuvable sur le Lodestone.', 'unknown-character');
  if (page === 'indisponible') return error(503, 'Le Lodestone ne répond pas, réessaie dans un moment.', 'lodestone-down');
  if (!page.includes(claim.code)) {
    return error(409, 'Code introuvable dans ta présentation Lodestone. Le Lodestone peut mettre quelques minutes à se mettre à jour.', 'code-not-found');
  }
  await writeJson(env, ownerKey(id), { secretHash, claimedAt: new Date().toISOString(), via: 'lodestone' } satisfies Owner);
  await env.MODELS.delete(claimKey(id));
  return json({ ok: true });
}

/** Diagnostic des couleurs : seul l'ordinateur lié au personnage peut l'envoyer. */
async function putDebug(request: Request, env: Env, id: number): Promise<Response> {
  const secret = secretOf(request);
  const owner = await readJson<Owner>(env, ownerKey(id));
  if (!secret || !owner || !safeEqual(owner.secretHash, await sha256(secret))) {
    return error(403, 'Envoie d’abord le modèle depuis ce PC.', 'claimed');
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_DEBUG_BYTES) return error(413, 'Diagnostic trop lourd.', 'too-large');
  // Archive .zip : commence par « PK\x03\x04 ».
  if (body.byteLength < 4 || new DataView(body).getUint32(0, true) !== 0x04034b50) {
    return error(415, 'Ce n’est pas une archive .zip.', 'not-zip');
  }
  await env.MODELS.put(debugKey(id), body, { httpMetadata: { contentType: 'application/zip' } });
  return json({ ok: true, size: body.byteLength }, 201);
}

async function getDebug(env: Env, id: number): Promise<Response> {
  const object = await env.MODELS.get(debugKey(id));
  if (!object) return error(404, 'Aucun diagnostic pour ce personnage.', 'not-found');
  const headers = new Headers(CORS);
  object.writeHttpMetadata(headers);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  return new Response(object.body, { status: 200, headers });
}

async function getModel(request: Request, env: Env, id: number): Promise<Response> {
  const object = await env.MODELS.get(modelKey(id), { onlyIf: request.headers });
  if (!object) return error(404, 'Aucun modèle 3D pour ce personnage.', 'not-found');
  const headers = new Headers(CORS);
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('Cache-Control', 'public, no-cache');
  if (object.customMetadata?.appearanceHash) headers.set('X-Appearance-Hash', object.customMetadata.appearanceHash);
  // Condition If-None-Match remplie : R2 renvoie l'objet sans contenu.
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  return new Response(object.body, { status: 200, headers });
}

async function getInfo(env: Env, id: number): Promise<Response> {
  const object = await env.MODELS.head(modelKey(id));
  if (!object) return error(404, 'Aucun modèle 3D pour ce personnage.', 'not-found');
  return json(toInfo(id, object), 200, { 'Cache-Control': 'public, max-age=30' });
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/health') return json({ ok: true });
  const privateResponse = await handlePrivate(request, env, url);
  if (privateResponse) return privateResponse;

  const match = /^\/v1\/characters\/([^/]+)\/(model|model\/info|claim|claim\/verify|debug)$/.exec(url.pathname);
  if (!match) return error(404, 'Route inconnue.', 'not-found');
  const id = parseId(match[1]);
  if (id === null) return error(400, 'Identifiant de personnage invalide.', 'bad-id');

  switch (`${method} ${match[2]}`) {
    case 'GET model':
    case 'HEAD model':
      return getModel(request, env, id);
    case 'GET model/info':
      return getInfo(env, id);
    case 'PUT model':
      return putModel(request, env, id);
    case 'DELETE model':
      return deleteModel(request, env, id);
    case 'POST claim':
      return startClaim(request, env, id);
    case 'POST claim/verify':
      return verifyClaim(request, env, id);
    case 'PUT debug':
      return putDebug(request, env, id);
    case 'GET debug':
      return getDebug(env, id);
    default:
      return error(405, 'Méthode non autorisée.', 'method');
  }
}
