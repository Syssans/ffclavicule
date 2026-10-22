import { getItemSummaries } from '../xivapi';
import { getPrivate, normalizeCode, pairDevice, ventureStatus } from '../private';

const BASE = 'https://sync.exemple';
let calls: { url: string; init?: RequestInit }[] = [];

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  calls = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return handler(String(input), init);
  }) as typeof fetch;
}

afterEach(() => jest.restoreAllMocks());

describe('connexion d’un téléphone', () => {
  it('nettoie le code saisi', () => {
    expect(normalizeCode(' 123-456 ')).toBe('123456');
    expect(normalizeCode('12 34 56 78')).toBe('123456');
  });

  it('échange le code contre un jeton', async () => {
    mockFetch(() => Response.json({ characterId: 42, name: 'Six Clavicule', world: 'Moogle', token: 'jeton', deviceId: 'd1' }, { status: 201 }));
    const link = await pairDevice('123 456', BASE);
    expect(link).toMatchObject({ characterId: 42, name: 'Six Clavicule', token: 'jeton', deviceId: 'd1' });
    expect(calls[0].url).toBe(`${BASE}/v1/pair`);
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ code: '123456' });
  });

  it('affiche le message du service pour un code refusé', async () => {
    mockFetch(() => Response.json({ error: 'Code inconnu ou expiré', code: 'bad-code' }, { status: 404 }));
    await expect(pairDevice('000000', BASE)).rejects.toThrow('Code inconnu ou expiré');
  });
});

describe('lecture des données privées', () => {
  it('envoie le jeton et explique une déconnexion', async () => {
    mockFetch(() => Response.json({ error: 'non' }, { status: 401 }));
    await expect(getPrivate(42, 'jeton', BASE)).rejects.toThrow('n’est plus connecté');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer jeton');
  });

  it('renvoie null tant que le plugin n’a rien envoyé', async () => {
    mockFetch(() => Response.json({ error: 'absent' }, { status: 404 }));
    await expect(getPrivate(42, 'jeton', BASE)).resolves.toBeNull();
  });
});

describe('missions des servants', () => {
  const now = Date.UTC(2026, 9, 22, 12, 0, 0);
  it('décrit le temps restant', () => {
    expect(ventureStatus(0, now)).toBeNull();
    expect(ventureStatus(now / 1000 - 10, now)).toEqual({ done: true, label: 'Mission terminée' });
    expect(ventureStatus(now / 1000 + 3 * 3600 + 12 * 60, now)?.label).toBe('Retour dans 3 h 12');
    expect(ventureStatus(now / 1000 + 25 * 60, now)?.label).toBe('Retour dans 25 min');
  });
});

describe('noms des objets', () => {
  it('demande les objets par paquets de 100, sans doublon', async () => {
    mockFetch((url) => {
      const rows = new URL(url).searchParams.get('rows')!.split(',').map(Number);
      return Response.json({ rows: rows.map((id) => ({ row_id: id, fields: { Name: `Objet ${id}` } })) });
    });
    const ids = [...Array.from({ length: 150 }, (_, i) => i + 1), 5, 5, 0];
    const map = await getItemSummaries(ids);
    expect(map.size).toBe(150);
    expect(calls).toHaveLength(2);
    expect(map.get(150)?.name).toBe('Objet 150');
  });
});
