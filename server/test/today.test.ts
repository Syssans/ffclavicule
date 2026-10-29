import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ADMIN = 'a'.repeat(40);
const OWNER = 't'.repeat(43);
const ID = 41234567;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
    // Faux Lodestone.
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<p class="frame__chara__name">Six Clavicule</p>');
  });
  await new Promise<void>((resolve) => fakes.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(fakes.address() as AddressInfo).port}`;
  worker = await unstable_dev('src/index.ts', {
    local: true,
    vars: { LODESTONE_URL: base, EXPO_PUSH_URL: `${base}/push`, ADMIN_TOKEN: ADMIN },
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

// Jeudi 29 octobre 2026 : relevé à 13 h UTC, réinitialisation quotidienne à 15 h.
const duties = {
  updatedAt: '2026-10-29T13:00:00.000Z',
  dailyCycle: 0,
  weeklyCycle: 0,
  roulettes: [5],
  tribeAllowances: 6,
  mapReadyAt: 0,
  deliveries: 0,
  tomestones: 200,
  tomestoneLimit: 450,
};

async function pairPhone(): Promise<{ token: string; deviceId: string }> {
  const start = await worker.fetch(`/v1/characters/${ID}/pairing`, { method: 'POST', headers: auth(OWNER) });
  const { code } = (await start.json()) as { code: string };
  const res = await worker.fetch('/v1/pair', { method: 'POST', body: JSON.stringify({ code, device: 'iPhone' }) });
  return (await res.json()) as { token: string; deviceId: string };
}

async function registerPush(token: string): Promise<string> {
  const res = await worker.fetch('/v1/notify/register', { method: 'POST', body: JSON.stringify({ pushToken: token }) });
  return ((await res.json()) as { secret: string }).secret;
}

const run = async (now: string) =>
  (await (await worker.fetch(`/v1/notify/run?now=${now}`, { method: 'POST', headers: auth(ADMIN) })).json()) as { reminders: number };

describe('rappel « Aujourd’hui »', () => {
  it('prévient une fois avant la réinitialisation, avec ce qu’il reste', async () => {
    expect(
      (await worker.fetch(`/v1/characters/${ID}/private`, { method: 'PUT', body: JSON.stringify({ schema: 1, duties }), headers: auth(OWNER) }))
        .status,
    ).toBe(201);
    const phone = await pairPhone();
    const secret = await registerPush('ExponentPushToken[aujourdhui-0001]');
    const put = (body: unknown) => worker.fetch('/v1/notify/today', { method: 'PUT', headers: auth(secret), body: JSON.stringify(body) });
    const settings = {
      characterId: ID,
      privateToken: phone.token,
      tracked: ['roulette:5', 'roulette:6', 'tribes', 'miniCactpot', 'deliveries', 'tomestones', 'inconnue'],
      checked: { miniCactpot: Date.parse('2026-10-29T12:00:00Z') },
      daily: true,
      weekly: true,
      lead: 60,
    };
    // Un jeton qui n'est pas celui d'un téléphone associé est refusé.
    expect((await put({ ...settings, privateToken: 'x'.repeat(40) })).status).toBe(403);
    expect((await put(settings)).status).toBe(200);

    pushed.length = 0;
    // Trop tôt : rien.
    expect((await run('2026-10-29T13:50:00Z')).reminders).toBe(0);
    // Dans l'heure qui précède : un rappel, une seule fois.
    expect((await run('2026-10-29T14:03:00Z')).reminders).toBe(1);
    expect(pushed[0]).toMatchObject({
      to: 'ExponentPushToken[aujourdhui-0001]',
      title: 'Réinitialisation quotidienne dans 1 h',
      data: { url: '/today' },
    });
    expect(pushed[0].body).toBe('Il te reste : Défis, Peuples alliés (6 quêtes).');
    expect((await run('2026-10-29T14:13:00Z')).reminders).toBe(0);

    // Lundi soir, avant la réinitialisation du mardi : les mémoquartz manquent (relevé de cette semaine).
    expect((await run('2026-11-03T07:13:00Z')).reminders).toBe(1);
    expect(pushed[1].title).toBe('Réinitialisation hebdomadaire dans 50 min');
    expect(pushed[1].body).toBe('Il te reste : Mémoquartz (200/450).');

    // Téléphone retiré depuis le plugin : plus de rappel.
    await worker.fetch(`/v1/characters/${ID}/devices/${phone.deviceId}`, { method: 'DELETE', headers: auth(OWNER) });
    expect((await run('2026-11-04T14:05:00Z')).reminders).toBe(0);

    // Rappels coupés.
    expect(((await (await put({ daily: false, weekly: false })).json()) as { enabled: boolean }).enabled).toBe(false);
  });
});
