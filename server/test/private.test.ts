import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const OWNER = 'p'.repeat(43);
const OTHER = 'q'.repeat(43);
const ID = 39451459;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let lodestone: Server;
let worker: Unstable_DevWorker;

function glb(): Uint8Array {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 12, true);
  return bytes;
}

beforeAll(async () => {
  lodestone = createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<p class="frame__chara__name">Six Clavicule</p>');
  });
  await new Promise<void>((resolve) => lodestone.listen(0, '127.0.0.1', resolve));
  worker = await unstable_dev('src/index.ts', {
    local: true,
    vars: { LODESTONE_URL: `http://127.0.0.1:${(lodestone.address() as AddressInfo).port}` },
    persist: false,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true },
  });
  // Le personnage est lié à ce PC par l'envoi de son modèle.
  const put = await worker.fetch(`/v1/characters/${ID}/model`, { method: 'PUT', body: glb(), headers: auth(OWNER) });
  expect(put.status).toBe(201);
}, 60_000);

afterAll(async () => {
  await worker?.stop();
  lodestone?.close();
});

const snapshot = { schema: 1, gil: 123456, inventories: { sacs: { items: [{ id: 5057, qty: 12, hq: false }] } } };

async function pairPhone(device = 'iPhone de test'): Promise<{ token: string; deviceId: string }> {
  const start = await worker.fetch(`/v1/characters/${ID}/pairing`, {
    method: 'POST',
    headers: { ...auth(OWNER), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Six Clavicule', world: 'Moogle' }),
  });
  expect(start.status).toBe(201);
  const { code } = (await start.json()) as { code: string };
  expect(code).toMatch(/^\d{6}$/);
  const res = await worker.fetch('/v1/pair', { method: 'POST', body: JSON.stringify({ code: `${code.slice(0, 3)} ${code.slice(3)}`, device }) });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { characterId: number; name: string; world: string; token: string; deviceId: string };
  expect(body).toMatchObject({ characterId: ID, name: 'Six Clavicule', world: 'Moogle' });
  return body;
}

describe('données privées et association des téléphones', () => {
  it('seul le PC lié peut envoyer les données et demander un code', async () => {
    const put = (secret: string, body: string) => worker.fetch(`/v1/characters/${ID}/private`, { method: 'PUT', body, headers: auth(secret) });
    expect((await put(OTHER, JSON.stringify(snapshot))).status).toBe(403);
    expect((await put(OWNER, 'pas du json')).status).toBe(400);
    expect((await put(OWNER, JSON.stringify(snapshot))).status).toBe(201);
    expect((await worker.fetch(`/v1/characters/${ID}/pairing`, { method: 'POST', headers: auth(OTHER) })).status).toBe(403);
  });

  it('les données ne sont lisibles qu’avec le jeton d’un téléphone associé', async () => {
    expect((await worker.fetch(`/v1/characters/${ID}/private`)).status).toBe(401);
    expect((await worker.fetch(`/v1/characters/${ID}/private`, { headers: auth(OWNER) })).status).toBe(401);

    const { token } = await pairPhone();
    const get = await worker.fetch(`/v1/characters/${ID}/private`, { headers: auth(token) });
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual(snapshot);
    const again = await worker.fetch(`/v1/characters/${ID}/private`, { headers: { ...auth(token), 'If-None-Match': get.headers.get('ETag')! } });
    expect(again.status).toBe(304);
    // Le jeton ne vaut que pour son personnage.
    expect((await worker.fetch('/v1/characters/111/private', { headers: auth(token) })).status).toBe(401);
  });

  it('le catalogue des collections suit les mêmes règles que les données', async () => {
    const catalog = { schema: 1, collections: [{ key: 'mounts', label: 'Montures', items: [] }] };
    expect((await worker.fetch(`/v1/characters/${ID}/catalog`, { method: 'PUT', body: JSON.stringify(catalog), headers: auth(OTHER) })).status).toBe(403);
    expect((await worker.fetch(`/v1/characters/${ID}/catalog`, { method: 'PUT', body: JSON.stringify(catalog), headers: auth(OWNER) })).status).toBe(201);
    expect((await worker.fetch(`/v1/characters/${ID}/catalog`)).status).toBe(401);
    const { token } = await pairPhone('Catalogue');
    const get = await worker.fetch(`/v1/characters/${ID}/catalog`, { headers: auth(token) });
    expect(await get.json()).toEqual(catalog);
    // Les données privées ne sont pas écrasées par le catalogue.
    expect(((await (await worker.fetch(`/v1/characters/${ID}/private`, { headers: auth(token) })).json()) as { gil: number }).gil).toBe(123456);
  });

  it('un code ne sert qu’une fois et un mauvais code est refusé', async () => {
    const start = await worker.fetch(`/v1/characters/${ID}/pairing`, { method: 'POST', headers: auth(OWNER) });
    const { code } = (await start.json()) as { code: string };
    const use = () => worker.fetch('/v1/pair', { method: 'POST', body: JSON.stringify({ code }) });
    expect((await use()).status).toBe(201);
    expect((await use()).status).toBe(404);
    const wrong = await worker.fetch('/v1/pair', { method: 'POST', body: JSON.stringify({ code: '12' }) });
    expect(wrong.status).toBe(400);
  });

  it('le PC voit et retire les téléphones ; un téléphone peut se déconnecter', async () => {
    const a = await pairPhone('Téléphone A');
    const b = await pairPhone('Téléphone B');
    const list = await worker.fetch(`/v1/characters/${ID}/devices`, { headers: auth(OWNER) });
    const { devices } = (await list.json()) as { devices: { id: string; name: string; tokenHash?: string }[] };
    expect(devices.map((d) => d.name)).toEqual(expect.arrayContaining(['Téléphone A', 'Téléphone B']));
    expect(devices.every((d) => d.tokenHash === undefined)).toBe(true);

    expect((await worker.fetch(`/v1/characters/${ID}/devices/${a.deviceId}`, { method: 'DELETE', headers: auth(OTHER) })).status).toBe(403);
    expect((await worker.fetch(`/v1/characters/${ID}/devices/${a.deviceId}`, { method: 'DELETE', headers: auth(OWNER) })).status).toBe(204);
    expect((await worker.fetch(`/v1/characters/${ID}/private`, { headers: auth(a.token) })).status).toBe(401);

    expect((await worker.fetch(`/v1/characters/${ID}/devices/self`, { method: 'DELETE', headers: auth(b.token) })).status).toBe(204);
    expect((await worker.fetch(`/v1/characters/${ID}/private`, { headers: auth(b.token) })).status).toBe(401);
  });

  it('limite les tentatives d’association', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      statuses.push((await worker.fetch('/v1/pair', { method: 'POST', body: JSON.stringify({ code: '000000' }) })).status);
    }
    expect(statuses).toContain(429);
  });
});
