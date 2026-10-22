import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const OWNER = 'h'.repeat(43);
const ID = 51234567;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let lodestone: Server;
let worker: Unstable_DevWorker;
let phone: string;

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
  expect((await worker.fetch(`/v1/characters/${ID}/model`, { method: 'PUT', body: glb(), headers: auth(OWNER) })).status).toBe(201);
  const start = await worker.fetch(`/v1/characters/${ID}/pairing`, { method: 'POST', headers: auth(OWNER) });
  const { code } = (await start.json()) as { code: string };
  const pair = await worker.fetch('/v1/pair', { method: 'POST', body: JSON.stringify({ code, device: 'iPhone' }) });
  phone = ((await pair.json()) as { token: string }).token;
}, 60_000);

afterAll(async () => {
  await worker?.stop();
  lodestone?.close();
});

const hud = { schema: 1, screen: { width: 2560, height: 1440 }, currentLayout: 0, layouts: [] };
const changes = `/v1/characters/${ID}/hud/changes`;

interface Change {
  id: string;
  kind: string;
  status: string;
  device: string;
  message?: string;
  change: Record<string, unknown>;
}

async function add(body: unknown, token = phone): Promise<Response> {
  return worker.fetch(changes, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });
}

describe('ATH modifiable depuis l’appli', () => {
  it('le relevé vient du PC lié et ne se lit qu’avec un téléphone associé', async () => {
    expect((await worker.fetch(`/v1/characters/${ID}/hud`, { headers: auth(phone) })).status).toBe(404);
    expect((await worker.fetch(`/v1/characters/${ID}/hud`, { method: 'PUT', body: JSON.stringify(hud), headers: auth('x'.repeat(43)) })).status).toBe(403);
    expect((await worker.fetch(`/v1/characters/${ID}/hud`, { method: 'PUT', body: JSON.stringify(hud), headers: auth(OWNER) })).status).toBe(201);
    expect((await worker.fetch(`/v1/characters/${ID}/hud`)).status).toBe(401);
    const get = await worker.fetch(`/v1/characters/${ID}/hud`, { headers: auth(phone) });
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual(hud);
    const again = await worker.fetch(`/v1/characters/${ID}/hud`, { headers: { ...auth(phone), 'If-None-Match': get.headers.get('ETag')! } });
    expect(again.status).toBe(304);
  });

  it('le téléphone dépose une modification, le plugin l’applique et l’acquitte', async () => {
    expect((await add({ kind: 'layout', layout: 0, elements: [] }, OWNER)).status).toBe(401);
    expect((await add({ kind: 'formater-le-disque' })).status).toBe(400);

    const res = await add({ kind: 'layout', layout: 1, elements: [{ hash: 3297588741, x: 50, y: 90 }] });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Change;
    expect(created).toMatchObject({ kind: 'layout', status: 'pending', device: 'iPhone' });

    const pending = await worker.fetch(`${changes}?pending=1`, { headers: auth(OWNER) });
    const { changes: list } = (await pending.json()) as { changes: Change[] };
    expect(list.map((c) => c.id)).toEqual([created.id]);
    expect(list[0].change).toMatchObject({ layout: 1 });

    // Seul le PC lié acquitte.
    const ack = (token: string, body: unknown) =>
      worker.fetch(`${changes}/${created.id}`, { method: 'POST', headers: auth(token), body: JSON.stringify(body) });
    expect((await ack(phone, { status: 'applied' })).status).toBe(403);
    expect((await ack(OWNER, { status: 'n-importe' })).status).toBe(400);
    expect((await ack(OWNER, { status: 'applied', message: '1 élément déplacé.' })).status).toBe(200);

    const after = (await (await worker.fetch(`${changes}?pending=1`, { headers: auth(OWNER) })).json()) as { changes: Change[] };
    expect(after.changes).toEqual([]);
    const all = (await (await worker.fetch(changes, { headers: auth(phone) })).json()) as { changes: Change[] };
    expect(all.changes.find((c) => c.id === created.id)).toMatchObject({ status: 'applied', message: '1 élément déplacé.' });
  });

  it('une modification en attente peut être annulée, pas une modification appliquée', async () => {
    const created = (await (await add({ kind: 'activate', layout: 2 })).json()) as Change;
    expect((await worker.fetch(`${changes}/${created.id}`, { method: 'DELETE', headers: auth(OWNER) })).status).toBe(401);
    expect((await worker.fetch(`${changes}/${created.id}`, { method: 'DELETE', headers: auth(phone) })).status).toBe(204);
    expect((await worker.fetch(`${changes}/${created.id}`, { method: 'DELETE', headers: auth(phone) })).status).toBe(409);
    const pending = (await (await worker.fetch(`${changes}?pending=1`, { headers: auth(OWNER) })).json()) as { changes: Change[] };
    expect(pending.changes).toEqual([]);
  });

  it('limite les modifications en attente', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await add({ kind: 'hotbars', job: 19, slots: [] })).status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses.at(-1)).toBe(429);
  });
});
