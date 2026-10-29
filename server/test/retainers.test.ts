import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ADMIN = 'a'.repeat(40);
const OWNER = 'r'.repeat(43);
const ID = 41234999;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const T0 = Date.parse('2026-10-29T12:00:00Z');
const MIN = 60_000;
type Board = { lastUploadTime: number; listings: object[]; recentHistory: object[] };
/** Faux Universalis (monde Moogle) : annonces et ventes de chaque objet. */
const boards: Record<number, Board> = {
  5057: {
    lastUploadTime: T0 - 5 * MIN,
    listings: [
      { pricePerUnit: 800, quantity: 3, hq: false, retainerName: 'Autre' },
      { pricePerUnit: 1000, quantity: 10, hq: false, retainerName: 'Alpha' },
    ],
    recentHistory: [],
  },
  4: { lastUploadTime: T0 - 5 * MIN, listings: [{ pricePerUnit: 5000, quantity: 1, hq: true, retainerName: 'Alpha' }], recentHistory: [] },
};

/** Notifications reçues par le faux service d'Expo. */
const pushed: { to: string; title: string; body: string; data: { url?: string } }[] = [];

let fakes: Server;
let worker: Unstable_DevWorker;

async function readBody(req: IncomingMessage): Promise<string> {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text;
}

function glb(): Uint8Array {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 12, true);
  return bytes;
}

beforeAll(async () => {
  fakes = createServer(async (req, res) => {
    if (req.url === '/push') {
      const messages = JSON.parse(await readBody(req)) as typeof pushed;
      pushed.push(...messages);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: messages.map(() => ({ status: 'ok' })) }));
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    const market = /^\/api\/v2\/Moogle\/([\d,]+)$/.exec(url.pathname);
    if (market) {
      const ids = market[1].split(',').map(Number);
      const one = (id: number) => ({ itemID: id, ...boards[id] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ids.length === 1 ? one(ids[0]) : { items: Object.fromEntries(ids.map((id) => [id, one(id)])) }));
      return;
    }
    if (url.pathname === '/api/sheet/Item') {
      const names: Record<string, string> = { 5057: 'Lingot de fer', 4: 'Cristal de vent' };
      const rows = (url.searchParams.get('rows') ?? '').split(',').map((id) => ({ row_id: Number(id), fields: { Name: names[id] } }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ rows }));
      return;
    }
    // Faux Lodestone.
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<p class="frame__chara__name">Six Clavicule</p>');
  });
  await new Promise<void>((resolve) => fakes.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(fakes.address() as AddressInfo).port}`;
  worker = await unstable_dev('src/index.ts', {
    local: true,
    vars: { LODESTONE_URL: base, UNIVERSALIS_URL: base, XIVAPI_URL: base, EXPO_PUSH_URL: `${base}/push`, ADMIN_TOKEN: ADMIN },
    persist: false,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true },
  });
  expect((await worker.fetch(`/v1/characters/${ID}/model`, { method: 'PUT', body: glb(), headers: auth(OWNER) })).status).toBe(201);
}, 60_000);

afterAll(async () => {
  await worker?.stop();
  fakes?.close();
});

const snapshot = {
  schema: 1,
  world: 'Moogle',
  retainers: [
    {
      id: '1',
      name: 'Alpha',
      market: [
        { id: 5057, qty: 10, hq: false, price: 1000 },
        { id: 4, qty: 1, hq: true, price: 5000 },
      ],
    },
  ],
};

async function pairPhone(): Promise<{ token: string; deviceId: string }> {
  const start = await worker.fetch(`/v1/characters/${ID}/pairing`, { method: 'POST', headers: auth(OWNER) });
  const { code } = (await start.json()) as { code: string };
  const res = await worker.fetch('/v1/pair', { method: 'POST', body: JSON.stringify({ code, device: 'iPhone' }) });
  return (await res.json()) as { token: string; deviceId: string };
}

const run = async (at: number) =>
  (await (await worker.fetch(`/v1/notify/run?now=${new Date(at).toISOString()}`, { method: 'POST', headers: auth(ADMIN) })).json()) as {
    retainers: number;
  };

describe('alertes des servants', () => {
  it('prix cassé, vente et invendu, chacun une fois', async () => {
    expect((await worker.fetch(`/v1/characters/${ID}/private`, { method: 'PUT', body: JSON.stringify(snapshot), headers: auth(OWNER) })).status).toBe(
      201,
    );
    const phone = await pairPhone();
    const reg = await worker.fetch('/v1/notify/register', {
      method: 'POST',
      body: JSON.stringify({ pushToken: 'ExponentPushToken[servants-0001]' }),
    });
    const { secret } = (await reg.json()) as { secret: string };
    const put = (body: unknown) => worker.fetch('/v1/notify/retainers', { method: 'PUT', headers: auth(secret), body: JSON.stringify(body) });
    expect((await put({ characterId: ID, privateToken: 'x'.repeat(40), sold: true })).status).toBe(403);
    expect((await put({ characterId: ID, privateToken: phone.token, sold: true, undercut: 10, stale: 5 })).status).toBe(200);

    pushed.length = 0;
    // Un autre vendeur est 20 % moins cher sur le lingot.
    expect((await run(T0)).retainers).toBe(1);
    expect(pushed[0]).toMatchObject({ title: 'Prix cassé', data: { url: `/retainers/${ID}` } });
    expect(pushed[0].body).toBe('Lingot de fer : 800 gils sur Moogle, 20 % sous ton prix (1 000 gils).');
    // Dix minutes plus tard : pas encore de nouvelle vérification.
    expect((await run(T0 + 10 * MIN)).retainers).toBe(0);

    // Le cristal HQ disparaît du marché, et une vente identique apparaît dans l'historique.
    boards[4] = {
      lastUploadTime: T0 + 20 * MIN,
      listings: [],
      recentHistory: [{ pricePerUnit: 5000, quantity: 1, hq: true, timestamp: (T0 + 15 * MIN) / 1000 }],
    };
    expect((await run(T0 + 30 * MIN)).retainers).toBe(1);
    expect(pushed[1]).toMatchObject({ title: 'Vendu !', body: 'Cristal de vent HQ : 5 000 gils (Alpha).' });

    // Six jours plus tard, le lingot n'a toujours pas trouvé preneur.
    expect((await run(T0 + 6 * 86_400_000)).retainers).toBe(1);
    expect(pushed[2]).toMatchObject({ title: 'Toujours en vente', body: 'Lingot de fer attend un acheteur depuis 6 jours.' });
    expect((await run(T0 + 6 * 86_400_000 + 30 * MIN)).retainers).toBe(0);

    // En jeu, le plugin voit la vente du lingot dans le chat : annoncée avec les gils reçus.
    const sold = { ...snapshot, retainers: [{ ...snapshot.retainers[0], market: [] }] };
    const sale = { id: 5057, hq: false, qty: 10, price: 1000, gil: 9500, retainerId: '1', retainer: 'Alpha', at: Math.floor(Date.now() / 1000) + 60 };
    await worker.fetch(`/v1/characters/${ID}/private`, { method: 'PUT', body: JSON.stringify({ ...sold, sales: [sale] }), headers: auth(OWNER) });
    expect((await run(T0 + 6 * 86_400_000 + 60 * MIN)).retainers).toBe(1);
    expect(pushed[3]).toMatchObject({ title: 'Vendu !', body: 'Lingot de fer × 10 : 9 500 gils (Alpha).' });
    expect((await run(T0 + 6 * 86_400_000 + 90 * MIN)).retainers).toBe(0);

    expect(((await (await put({ sold: false })).json()) as { enabled: boolean }).enabled).toBe(false);
  });
});
