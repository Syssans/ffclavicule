import { runDiagnostics } from '../diagnostics';

afterEach(() => jest.restoreAllMocks());

it('décrit chaque source, avec le détail technique en cas d’échec', async () => {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('finalfantasyxiv.com')) {
      return new Response('<html><head><title>Lodestone mobile</title></head><body>sp</body></html>');
    }
    if (url.includes('xivapi.com')) throw new TypeError('Network request failed');
    if (url.includes('universalis.app')) return new Response(JSON.stringify([{ name: 'Chaos', region: 'Europe', worlds: [39] }]));
    return new Response(JSON.stringify({ id: 1, name: 'Chocobo de compagnie' }));
  }) as typeof fetch;

  const results = await runDiagnostics('eu');
  const by = Object.fromEntries(results.map((r) => [r.source, r]));

  expect(by.Lodestone).toMatchObject({
    ok: false,
    summary: 'La page reçue ne contient aucun personnage : ce n’est pas la page attendue.',
    detail: expect.stringContaining('0 fiches dans le HTML, 0 lues'),
  });
  expect(by.XIVAPI).toMatchObject({
    ok: false,
    summary: 'Impossible de joindre XIVAPI. Vérifie ta connexion.',
    detail: 'v2.xivapi.com : Network request failed',
  });
  expect(by.Universalis).toMatchObject({ ok: true, summary: '1 centres de données.' });
  expect(by['FFXIV Collect']).toBeUndefined();
});
