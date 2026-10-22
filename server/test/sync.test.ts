import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const READ = 'lecture-groupe';
const WRITE = { anton: 'ecriture-anton', amie: 'ecriture-amie' };

/** Plus petit fichier .glb valide pour le service : en-tête « glTF », version 2, longueur. */
function glb(extra = 0): Uint8Array {
  const bytes = new Uint8Array(12 + extra);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  return bytes;
}

let worker: Unstable_DevWorker;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  worker = await unstable_dev('src/index.ts', {
    local: true,
    vars: { READ_TOKEN: READ, WRITE_TOKENS: JSON.stringify(WRITE) },
    persist: false,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

describe('Clavicule Sync (moteur Cloudflare local)', () => {
  it('répond à /health', async () => {
    const res = await worker.fetch('/health');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('refuse un envoi sans clé d’écriture, ou avec la clé de lecture', async () => {
    expect((await worker.fetch('/v1/characters/39451459/model', { method: 'PUT', body: glb() })).status).toBe(401);
    expect((await worker.fetch('/v1/characters/39451459/model', { method: 'PUT', body: glb(), headers: auth(READ) })).status).toBe(401);
  });

  it('refuse ce qui n’est pas un .glb et les identifiants invalides', async () => {
    const bad = await worker.fetch('/v1/characters/39451459/model', { method: 'PUT', body: 'pas un modèle', headers: auth(WRITE.anton) });
    expect(bad.status).toBe(415);
    expect((await worker.fetch('/v1/characters/abc/model', { headers: auth(READ) })).status).toBe(400);
  });

  it('stocke un modèle puis le rend à l’appli, avec ses infos', async () => {
    const body = glb(1000);
    const put = await worker.fetch('/v1/characters/39451459/model', {
      method: 'PUT',
      body,
      headers: { ...auth(WRITE.anton), 'X-Character-Name': encodeURIComponent('Six Clavicule'), 'X-Character-World': 'Moogle', 'X-Appearance-Hash': 'abc123' },
    });
    expect(put.status).toBe(201);
    expect(await put.json()).toMatchObject({ characterId: 39451459, name: 'Six Clavicule', world: 'Moogle', appearanceHash: 'abc123', uploadedBy: 'anton', size: 1012 });

    expect((await worker.fetch('/v1/characters/39451459/model')).status).toBe(401);
    const get = await worker.fetch('/v1/characters/39451459/model', { headers: auth(READ) });
    expect(get.status).toBe(200);
    expect(get.headers.get('Content-Type')).toBe('model/gltf-binary');
    expect(get.headers.get('X-Appearance-Hash')).toBe('abc123');
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(body);

    // L'appli garde le modèle en cache : s'il n'a pas changé, rien n'est retéléchargé.
    const etag = get.headers.get('ETag')!;
    const again = await worker.fetch('/v1/characters/39451459/model', { headers: { ...auth(READ), 'If-None-Match': etag } });
    expect(again.status).toBe(304);

    const info = await worker.fetch('/v1/characters/39451459/model/info', { headers: auth(READ) });
    expect(await info.json()).toMatchObject({ name: 'Six Clavicule', size: 1012 });

    const list = await worker.fetch('/v1/characters', { headers: auth(WRITE.amie) });
    expect((await list.json()) as unknown).toMatchObject({ characters: [{ characterId: 39451459, uploadedBy: 'anton' }] });
  });

  it('répond 404 pour un personnage sans modèle', async () => {
    expect((await worker.fetch('/v1/characters/1/model', { headers: auth(READ) })).status).toBe(404);
  });
});
