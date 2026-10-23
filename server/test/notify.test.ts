import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ADMIN = 'a'.repeat(40);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Prix affichés par le faux Universalis, par serveur puis par objet. */
const market: Record<string, Record<number, { minPrice: number; minPriceHQ: number; world: string }>> = {
  Chaos: { 5057: { minPrice: 900, minPriceHQ: 0, world: 'Moogle' }, 4: { minPrice: 300, minPriceHQ: 0, world: 'Omega' } },
  Moogle: { 31: { minPrice: 50_000, minPriceHQ: 80_000, world: 'Moogle' } },
};
/** Notifications reçues par le faux service d'Expo. */
const pushed: { to: string; title: string; body: string; data: { itemId?: number } }[] = [];

let fakes: Server;
let worker: Unstable_DevWorker;

async function readBody(req: IncomingMessage): Promise<string> {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text;
}

beforeAll(async () => {
  fakes = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/push') {
      const messages = JSON.parse(await readBody(req)) as typeof pushed;
      pushed.push(...messages);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: messages.map((m) => (m.to.includes('perime') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })) }));
      return;
    }
    const match = /^\/api\/v2\/([^/]+)\/([\d,]+)$/.exec(url.pathname);
    if (!match) return void res.writeHead(404).end();
    const scope = decodeURIComponent(match[1]);
    const ids = match[2].split(',').map(Number);
    const one = (id: number) => {
      const m = market[scope]?.[id];
      return { itemID: id, minPrice: m?.minPrice ?? 0, minPriceHQ: m?.minPriceHQ ?? 0, listings: m ? [{ worldName: m.world }] : [] };
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ids.length === 1 ? one(ids[0]) : { items: Object.fromEntries(ids.map((id) => [id, one(id)])) }));
  });
  await new Promise<void>((resolve) => fakes.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(fakes.address() as AddressInfo).port}`;
  worker = await unstable_dev('src/index.ts', {
    local: true,
    vars: { UNIVERSALIS_URL: base, EXPO_PUSH_URL: `${base}/push`, ADMIN_TOKEN: ADMIN },
    persist: false,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true },
  });
}, 60_000);

afterAll(async () => {
  await worker?.stop();
  fakes?.close();
});

async function register(token: string): Promise<string> {
  const res = await worker.fetch('/v1/notify/register', { method: 'POST', body: JSON.stringify({ pushToken: token }) });
  expect(res.status).toBe(201);
  return ((await res.json()) as { secret: string }).secret;
}

const run = async () => (await (await worker.fetch('/v1/notify/run', { method: 'POST', headers: auth(ADMIN) })).json()) as { sent: number };
const putAlerts = (secret: string, alerts: unknown[]) =>
  worker.fetch('/v1/notify/alerts', { method: 'PUT', headers: auth(secret), body: JSON.stringify({ alerts }) });

const lingot = { id: 'a1', itemId: 5057, itemName: 'Lingot de fer', scope: 'Chaos', condition: 'below', price: 1000, hq: false, enabled: true };

describe('alertes de prix du marché', () => {
  it('inscription : un vrai jeton Expo est exigé', async () => {
    expect((await worker.fetch('/v1/notify/register', { method: 'POST', body: JSON.stringify({ pushToken: 'n’importe quoi' }) })).status).toBe(400);
    const secret = await register('ExponentPushToken[telephone-a-0001]');
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect((await putAlerts('x'.repeat(40), [lingot])).status).toBe(401);
    expect((await putAlerts(secret, [{ ...lingot, price: -3 }])).status).toBe(400);
    expect((await putAlerts(secret, [{ ...lingot, scope: 'Chaos/../admin' }])).status).toBe(400);
  });

  it('prévient une fois quand le prix passe sous le seuil, puis seulement s’il baisse encore', async () => {
    const secret = await register('ExponentPushToken[telephone-b-0002]');
    expect((await putAlerts(secret, [lingot])).status).toBe(200);
    pushed.length = 0;

    expect((await run()).sent).toBe(1);
    expect(pushed[0]).toMatchObject({ to: 'ExponentPushToken[telephone-b-0002]', title: 'Lingot de fer', data: { itemId: 5057 } });
    expect(pushed[0].body).toContain('Moogle (Chaos)');
    expect(pushed[0].body).toContain('900');

    // Même prix : pas de nouvelle notification.
    expect((await run()).sent).toBe(0);
    // Baisse de plus de 5 % : nouvelle notification.
    market.Chaos[5057].minPrice = 800;
    expect((await run()).sent).toBe(1);
    // Remonte au-dessus du seuil : l'alerte se réarme, puis reprévient en redescendant.
    market.Chaos[5057].minPrice = 1500;
    expect((await run()).sent).toBe(0);
    market.Chaos[5057].minPrice = 950;
    expect((await run()).sent).toBe(1);

    const state = (await (await worker.fetch('/v1/notify/alerts', { headers: auth(secret) })).json()) as { state: Record<string, { lastPrice: number }> };
    expect(state.state.a1.lastPrice).toBe(950);
    await worker.fetch('/v1/notify', { method: 'DELETE', headers: auth(secret) });
  });

  it('HQ, seuil haut, alertes désactivées', async () => {
    const secret = await register('ExponentPushToken[telephone-c-0003]');
    await putAlerts(secret, [
      { id: 'hq', itemId: 31, itemName: 'Épée', scope: 'Moogle', condition: 'above', price: 70_000, hq: true, enabled: true },
      { id: 'off', itemId: 4, itemName: 'Cristal', scope: 'Chaos', condition: 'below', price: 1000, hq: false, enabled: false },
    ]);
    pushed.length = 0;
    await run();
    expect(pushed.map((p) => p.title)).toEqual(['Épée HQ']);
    expect(pushed[0].body).toContain('au-dessus');
    await worker.fetch('/v1/notify', { method: 'DELETE', headers: auth(secret) });
  });

  it('notification d’essai, et arrêt pour un téléphone qui n’existe plus', async () => {
    const ok = await register('ExponentPushToken[telephone-d-0004]');
    pushed.length = 0;
    expect((await worker.fetch('/v1/notify/test', { method: 'POST', headers: auth(ok) })).status).toBe(200);
    expect(pushed).toHaveLength(1);

    const gone = await register('ExponentPushToken[perime-0005]');
    await putAlerts(gone, [{ ...lingot, id: 'x' }]);
    market.Chaos[5057].minPrice = 700;
    await run();
    const after = (await (await worker.fetch('/v1/notify/alerts', { headers: auth(gone) })).json()) as { disabled: boolean };
    expect(after.disabled).toBe(true);
    // La vérification réservée à l'administration.
    expect((await worker.fetch('/v1/notify/run', { method: 'POST' })).status).toBe(403);
  });
});
