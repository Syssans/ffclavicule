/** Outils partagés par les routes du service (réponses, clés, stockage). */

export interface Env {
  MODELS: R2Bucket;
  /** Facultatif : clé de modération (supprimer un modèle, libérer un personnage). */
  ADMIN_TOKEN?: string;
  /** Facultatif : autre adresse du Lodestone (tests). */
  LODESTONE_URL?: string;
  /** Facultatif : autre adresse d'Universalis (tests). */
  UNIVERSALIS_URL?: string;
  /** Facultatif : autre adresse du service de notifications d'Expo (tests). */
  EXPO_PUSH_URL?: string;
}

export interface Owner {
  secretHash: string;
  claimedAt: string;
  via: 'premier-envoi' | 'lodestone';
}

export const MIN_SECRET_LENGTH = 32;

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, X-Appearance-Hash, X-Character-Name, X-Character-World',
  'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'ETag, X-Appearance-Hash, Last-Modified',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...headers },
  });
}

/** Erreur lisible, avec un code stable que le plugin et l'appli peuvent tester. */
export function error(status: number, message: string, code = 'error'): Response {
  return json({ error: message, code }, status);
}

/** Comparaison en temps constant, pour ne rien révéler par le temps de réponse. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function bearer(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '');
  return match ? match[1].trim() : null;
}

export function isAdmin(request: Request, env: Env): boolean {
  const token = bearer(request);
  return Boolean(env.ADMIN_TOKEN && token && safeEqual(token, env.ADMIN_TOKEN));
}

/** Secret du personnage, s'il est assez long pour être sérieux. */
export function secretOf(request: Request): string | null {
  const token = bearer(request);
  return token && token.length >= MIN_SECRET_LENGTH && token.length <= 256 ? token : null;
}

export const ownerKey = (id: number) => `owners/${id}.json`;

export async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const object = await env.MODELS.get(key);
  if (!object) return null;
  try {
    return (await object.json()) as T;
  } catch {
    return null;
  }
}

export async function writeJson(env: Env, key: string, value: unknown): Promise<void> {
  await env.MODELS.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } });
}

export function parseId(raw: string): number | null {
  return /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}

/** En-tête facultatif, limité en taille et sans caractères de contrôle. */
export function header(request: Request, name: string): string | undefined {
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

/** Vrai si la requête porte le secret du personnage (l'ordinateur lié). */
export async function isOwner(request: Request, env: Env, id: number): Promise<boolean> {
  const secret = secretOf(request);
  const owner = await readJson<Owner>(env, ownerKey(id));
  return Boolean(secret && owner && safeEqual(owner.secretHash, await sha256(secret)));
}
