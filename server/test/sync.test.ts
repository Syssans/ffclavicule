import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Plus petit fichier .glb valide pour le service : en-tête « glTF », version 2, longueur. */
function glb(extra = 0): Uint8Array {
  const bytes = new Uint8Array(12 + extra);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  return bytes;
}

const SECRET_PC1 = 'a'.repeat(43);
const SECRET_PC2 = 'b'.repeat(43);
const ADMIN = 'admin-clavicule';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Faux Lodestone : quelques personnages, avec une présentation modifiable par les tests. */
const profiles = new Map<number, { name: string; bio: string }>([
  [39451459, { name: 'Six Clavicule', bio: 'Bonjour !' }],
  [111, { name: "Y'shtola Rhul", bio: '' }],
  [222, { name: 'Autre Perso', bio: '' }],
  [333, { name: 'Perso Lent', bio: '' }],
]);
let lodestone: Server;
let worker: Unstable_DevWorker;

beforeAll(async () => {
  lodestone = createServer((req, res) => {
    const id = Number(/\/lodestone\/character\/(\d+)\//.exec(req.url ?? '')?.[1]);
    const profile = profiles.get(id);
    if (!profile) {
      res.writeHead(404).end('not found');
      return;
    }
    const name = profile.name.replace(/'/g, '&#39;');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<p class="frame__chara__name">${name}</p><div class="character__selfintroduction">${profile.bio}</div>`);
  });
  await new Promise<void>((resolve) => lodestone.listen(0, '127.0.0.1', resolve));
  const port = (lodestone.address() as AddressInfo).port;

  worker = await unstable_dev('src/index.ts', {
    local: true,
    vars: { ADMIN_TOKEN: ADMIN, LODESTONE_URL: `http://127.0.0.1:${port}` },
    persist: false,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
  lodestone?.close();
});

function upload(id: number, secret: string | null, body = glb(), extra: Record<string, string> = {}) {
  return worker.fetch(`/v1/characters/${id}/model`, {
    method: 'PUT',
    body,
    headers: { ...(secret ? auth(secret) : {}), ...extra },
  });
}

describe('Clavicule Sync (moteur Cloudflare local)', () => {
  it('répond à /health', async () => {
    const res = await worker.fetch('/health');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('refuse un envoi sans secret, un secret trop court, un fichier qui n’est pas un .glb', async () => {
    expect((await upload(39451459, null)).status).toBe(401);
    expect((await upload(39451459, 'court')).status).toBe(401);
    const bad = await upload(39451459, SECRET_PC1, new TextEncoder().encode('pas un modèle'));
    expect(bad.status).toBe(415);
    expect(await bad.json()).toMatchObject({ code: 'not-glb' });
    expect((await worker.fetch('/v1/characters/abc/model')).status).toBe(400);
  });

  it('refuse un personnage inconnu du Lodestone ou un nom qui ne correspond pas', async () => {
    const unknown = await upload(999, SECRET_PC1);
    expect(unknown.status).toBe(422);
    const wrongName = await upload(222, SECRET_PC1, glb(), { 'X-Character-Name': 'Usurpateur' });
    expect(wrongName.status).toBe(422);
    expect(await wrongName.json()).toMatchObject({ code: 'unknown-character' });
  });

  it('premier envoi : lie le personnage ; lecture publique, sans clé', async () => {
    const body = glb(1000);
    const put = await upload(39451459, SECRET_PC1, body, {
      'X-Character-Name': encodeURIComponent('Six Clavicule'),
      'X-Character-World': 'Moogle',
      'X-Appearance-Hash': 'abc123',
    });
    expect(put.status).toBe(201);
    expect(await put.json()).toMatchObject({ characterId: 39451459, name: 'Six Clavicule', world: 'Moogle', appearanceHash: 'abc123', size: 1012 });

    const get = await worker.fetch('/v1/characters/39451459/model');
    expect(get.status).toBe(200);
    expect(get.headers.get('Content-Type')).toBe('model/gltf-binary');
    expect(get.headers.get('X-Appearance-Hash')).toBe('abc123');
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(body);

    // L'appli garde le modèle en cache : s'il n'a pas changé, rien n'est retéléchargé.
    const again = await worker.fetch('/v1/characters/39451459/model', { headers: { 'If-None-Match': get.headers.get('ETag')! } });
    expect(again.status).toBe(304);

    const info = await worker.fetch('/v1/characters/39451459/model/info');
    expect(await info.json()).toMatchObject({ name: 'Six Clavicule', size: 1012 });
  });

  it('accepte les noms avec apostrophe (encodés par le Lodestone)', async () => {
    const put = await upload(111, SECRET_PC1, glb(), { 'X-Character-Name': encodeURIComponent("Y'shtola Rhul") });
    expect(put.status).toBe(201);
  });

  it('un autre ordinateur ne peut ni remplacer ni supprimer le modèle', async () => {
    const other = await upload(39451459, SECRET_PC2);
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({ code: 'claimed' });
    const del = await worker.fetch('/v1/characters/39451459/model', { method: 'DELETE', headers: auth(SECRET_PC2) });
    expect(del.status).toBe(403);
  });

  it('limite les envois trop rapprochés', async () => {
    const again = await upload(39451459, SECRET_PC1);
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ code: 'rate-limited' });
  });

  it('nouveau PC : le code collé dans la présentation Lodestone transfère le personnage', async () => {
    // Sans demande en cours, rien à vérifier.
    expect((await worker.fetch('/v1/characters/39451459/claim/verify', { method: 'POST', headers: auth(SECRET_PC2) })).status).toBe(404);

    const start = await worker.fetch('/v1/characters/39451459/claim', { method: 'POST', headers: auth(SECRET_PC2) });
    expect(start.status).toBe(200);
    const { code, profileUrl } = (await start.json()) as { code: string; profileUrl: string };
    expect(code).toMatch(/^CLAVICULE-[A-Z2-9]{8}$/);
    expect(profileUrl).toContain('/lodestone/character/39451459/');

    // Code pas encore collé.
    const early = await worker.fetch('/v1/characters/39451459/claim/verify', { method: 'POST', headers: auth(SECRET_PC2) });
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ code: 'code-not-found' });

    profiles.get(39451459)!.bio = `Bonjour ! ${code}`;
    // Un tiers qui n'a pas fait la demande ne peut pas profiter du code.
    const thief = await worker.fetch('/v1/characters/39451459/claim/verify', { method: 'POST', headers: auth('c'.repeat(43)) });
    expect(thief.status).toBe(404);

    const ok = await worker.fetch('/v1/characters/39451459/claim/verify', { method: 'POST', headers: auth(SECRET_PC2) });
    expect(ok.status).toBe(200);

    // Le nouveau PC peut supprimer le modèle ; l'ancien n'a plus la main.
    expect((await worker.fetch('/v1/characters/39451459/model', { method: 'DELETE', headers: auth(SECRET_PC1) })).status).toBe(403);
    expect((await worker.fetch('/v1/characters/39451459/model', { method: 'DELETE', headers: auth(SECRET_PC2) })).status).toBe(204);
    expect((await worker.fetch('/v1/characters/39451459/model')).status).toBe(404);
  });

  it('accepte un diagnostic .zip seulement du PC lié, et le rend lisible', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    const put = (secret: string, body: Uint8Array) =>
      worker.fetch('/v1/characters/111/debug', { method: 'PUT', body, headers: auth(secret) });
    expect((await put(SECRET_PC2, zip)).status).toBe(403);
    expect((await put(SECRET_PC1, glb())).status).toBe(415);
    expect((await put(SECRET_PC1, zip)).status).toBe(201);
    const get = await worker.fetch('/v1/characters/111/debug');
    expect(get.status).toBe(200);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(zip);
    expect((await worker.fetch('/v1/characters/222/debug')).status).toBe(404);
  });

  it('la clé d’admin supprime un modèle et libère le personnage', async () => {
    expect((await upload(333, SECRET_PC1)).status).toBe(201);
    expect((await worker.fetch('/v1/characters/333/model', { method: 'DELETE', headers: auth(ADMIN) })).status).toBe(204);
    // Libéré : un autre ordinateur peut maintenant le lier.
    expect((await upload(333, SECRET_PC2)).status).toBe(201);
  });

  it('répond 404 pour un personnage sans modèle', async () => {
    expect((await worker.fetch('/v1/characters/1/model')).status).toBe(404);
  });
});
