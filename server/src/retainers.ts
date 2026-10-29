/**
 * Alertes des servants : objet vendu, prix cassé par un autre vendeur, annonce qui dort. La tâche planifiée
 * compare toutes les 30 minutes les annonces relevées par le plugin (à la sonnette) au marché du monde sur
 * Universalis, même jeu et appli fermés.
 *
 * Comme pour « Aujourd'hui », le téléphone prouve qu'il est associé au personnage avec son jeton des données
 * privées ; le service n'en garde que l'empreinte, revérifiée à chaque passage.
 *
 *   PUT /v1/notify/retainers  { characterId, privateToken, sold, undercut, stale }   (secret du téléphone)
 */
import {
  checkListing,
  listingKey,
  type BoardItem,
  type ListingEvent,
  type ListingMemory,
  type MyListing,
  type RetainerAlertSettings,
} from '../../src/shared/retainer-market';
import { error, readJson, sha256, writeJson, type Env } from './common';
import { isPaired, readPrivate } from './private';

export const UNDERCUT_CHOICES = [0, 5, 10, 30];
export const STALE_CHOICES = [3, 5, 7, 14];
/** Entre deux vérifications d'un même téléphone. */
const EVERY_MS = 25 * 60_000;
const ITEMS_PER_REQUEST = 100;

export interface RetainerWatch extends RetainerAlertSettings {
  characterId: number;
  tokenHash: string;
  listings: Record<string, ListingMemory>;
  checkedAt?: number;
  /** Dernière vente annoncée par le plugin déjà traitée (secondes Unix). */
  salesSeen?: number;
}

export interface RetainerPush {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, unknown>;
}

/** Vente vue en direct par le plugin (message du jeu) : `qty` et `price` à 0 si l'annonce n'était pas connue. */
interface Sale {
  id: number;
  hq: boolean;
  qty: number;
  price: number;
  gil: number;
  retainerId: string;
  retainer: string;
  at: number;
}

interface Snapshot {
  world?: string;
  retainers?: { id: string; name: string; market?: { id: number; qty: number; hq: boolean; price: number }[] }[];
  sales?: Sale[];
}

export async function parseRetainerWatch(
  env: Env,
  raw: unknown,
  before: RetainerWatch | undefined,
): Promise<{ watch: RetainerWatch | null } | { error: Response }> {
  if (!raw || typeof raw !== 'object') return { error: error(400, 'Réglages attendus.', 'bad-json') };
  const b = raw as Record<string, unknown>;
  const undercut = UNDERCUT_CHOICES.includes(Number(b.undercut)) && b.undercut !== null ? Number(b.undercut) : null;
  const stale = STALE_CHOICES.includes(Number(b.stale)) && b.stale !== null ? Number(b.stale) : null;
  const sold = b.sold === true;
  if (!sold && undercut === null && stale === null) return { watch: null };
  const characterId = Number(b.characterId);
  if (!Number.isInteger(characterId) || characterId <= 0 || typeof b.privateToken !== 'string' || b.privateToken.length < 16) {
    return { error: error(400, 'Personnage ou jeton manquant.', 'bad-character') };
  }
  const tokenHash = await sha256(b.privateToken);
  if (!(await isPaired(env, characterId, tokenHash))) return { error: error(403, 'Ce téléphone n’est plus connecté à ce personnage.', 'not-paired') };
  const same = before && before.characterId === characterId;
  return {
    watch: {
      characterId,
      tokenHash,
      sold,
      undercut,
      stale,
      listings: same ? before.listings : {},
      checkedAt: same ? before.checkedAt : undefined,
      // Les ventes d'avant l'activation ne sont pas annoncées.
      salesSeen: same ? before.salesSeen : Math.floor(Date.now() / 1000),
    },
  };
}

/** Marché d'un monde pour plusieurs objets : toutes les annonces et les ventes récentes. */
async function fetchBoard(env: Env, world: string, ids: number[]): Promise<Map<number, BoardItem>> {
  const out = new Map<number, BoardItem>();
  const base = env.UNIVERSALIS_URL ?? 'https://universalis.app';
  for (let i = 0; i < ids.length; i += ITEMS_PER_REQUEST) {
    const chunk = ids.slice(i, i + ITEMS_PER_REQUEST);
    const url = `${base}/api/v2/${encodeURIComponent(world)}/${chunk.join(',')}?entries=20`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Clavicule (alertes des servants)' } }).catch(() => null);
    if (!response?.ok) continue;
    type Item = BoardItem & { itemID: number };
    const body = (await response.json().catch(() => null)) as (Item & { items?: Record<string, Item> }) | null;
    if (!body) continue;
    for (const item of chunk.length === 1 ? [body] : Object.values(body.items ?? {})) {
      if (!item?.itemID) continue;
      out.set(item.itemID, { lastUploadTime: item.lastUploadTime ?? 0, listings: item.listings ?? [], recentHistory: item.recentHistory ?? [] });
    }
  }
  return out;
}

const NAMES_KEY = 'names/items-fr.json';

/** Noms français des objets, gardés par le service (XIVAPI ne sert qu'une fois par objet). */
async function itemNames(env: Env, ids: number[]): Promise<Map<number, string>> {
  const known = (await readJson<Record<string, string>>(env, NAMES_KEY)) ?? {};
  const missing = ids.filter((id) => !known[id]);
  if (missing.length) {
    const base = env.XIVAPI_URL ?? 'https://v2.xivapi.com';
    for (let i = 0; i < missing.length; i += 100) {
      const rows = missing.slice(i, i + 100).join(',');
      const response = await fetch(`${base}/api/sheet/Item?rows=${rows}&fields=Name&language=fr`, { headers: { 'User-Agent': 'Clavicule' } }).catch(
        () => null,
      );
      const body = response?.ok
        ? ((await response.json().catch(() => null)) as { rows?: { row_id: number; fields?: { Name?: string } }[] } | null)
        : null;
      for (const row of body?.rows ?? []) if (row.fields?.Name) known[row.row_id] = row.fields.Name;
    }
    await writeJson(env, NAMES_KEY, known);
  }
  return new Map(ids.map((id) => [id, known[id] ?? `Objet ${id}`]));
}

const gil = (n: number) => `${n.toLocaleString('fr-FR').replace(/\s/g, ' ')} gils`;

/** Rédige les notifications d'un téléphone : une par vente, et les prix cassés ou invendus regroupés. */
export function retainerMessages(
  to: string,
  characterId: number,
  world: string,
  events: { listing: MyListing; event: ListingEvent }[],
  names: Map<number, string>,
): RetainerPush[] {
  const data = { url: `/retainers/${characterId}` };
  const name = (l: MyListing) => `${names.get(l.id) ?? `Objet ${l.id}`}${l.hq ? ' HQ' : ''}`;
  const out: RetainerPush[] = [];
  const sold = events.filter((e) => e.event.kind === 'sold');
  if (sold.length > 3) {
    const total = sold.reduce((s, e) => s + e.listing.price * e.listing.qty, 0);
    out.push({
      to,
      title: `${sold.length} objets vendus`,
      body: `${sold.map((e) => name(e.listing)).join(', ')} : ${gil(total)} en tout.`,
      sound: 'default',
      data,
    });
  } else {
    for (const { listing: l, event } of sold) {
      const received = event.kind === 'sold' && event.gil ? event.gil : l.price * l.qty;
      out.push({
        to,
        title: 'Vendu !',
        body: `${name(l)}${l.qty > 1 ? ` × ${l.qty}` : ''} : ${gil(received)}${l.retainer ? ` (${l.retainer})` : ''}.`,
        sound: 'default',
        data,
      });
    }
  }
  const undercut = events.flatMap((e) => (e.event.kind === 'undercut' ? [{ l: e.listing, ev: e.event }] : []));
  if (undercut.length === 1) {
    const { l, ev } = undercut[0];
    out.push({
      to,
      title: 'Prix cassé',
      body: `${name(l)} : ${gil(ev.cheapest)} sur ${world}, ${ev.percent} % sous ton prix (${gil(l.price)}).`,
      sound: 'default',
      data,
    });
  } else if (undercut.length > 1) {
    out.push({
      to,
      title: `${undercut.length} prix cassés`,
      body: `${undercut.map(({ l, ev }) => `${name(l)} (−${ev.percent} %)`).join(', ')}.`,
      sound: 'default',
      data,
    });
  }
  const stale = events.flatMap((e) => (e.event.kind === 'stale' ? [{ l: e.listing, days: e.event.days }] : []));
  if (stale.length === 1) {
    out.push({
      to,
      title: 'Toujours en vente',
      body: `${name(stale[0].l)} attend un acheteur depuis ${stale[0].days} jours.`,
      sound: 'default',
      data,
    });
  } else if (stale.length > 1) {
    const days = Math.min(...stale.map((s) => s.days));
    out.push({
      to,
      title: `${stale.length} objets invendus`,
      body: `Depuis plus de ${days} jours : ${stale.map((s) => name(s.l)).join(', ')}.`,
      sound: 'default',
      data,
    });
  }
  return out;
}

/** Vérifie les annonces des servants de chaque téléphone qui le demande ; met à jour sa mémoire. */
export async function retainerAlerts(
  env: Env,
  devices: { record: { pushToken: string; retainers?: RetainerWatch } }[],
  now: number,
): Promise<{ messages: RetainerPush[]; changed: Set<number> }> {
  const messages: RetainerPush[] = [];
  const changed = new Set<number>();
  const due = devices.flatMap(({ record }, index) => (record.retainers && now - (record.retainers.checkedAt ?? 0) >= EVERY_MS ? [index] : []));
  if (!due.length) return { messages, changed };

  // Annonces de chaque personnage concerné, puis une requête Universalis par monde et par paquet de 100 objets.
  const snapshots = new Map<number, { world: string; listings: MyListing[]; sales: Sale[] } | null>();
  for (const index of due) {
    const watch = devices[index].record.retainers!;
    changed.add(index);
    watch.checkedAt = now;
    if (!(await isPaired(env, watch.characterId, watch.tokenHash))) {
      devices[index].record.retainers = undefined;
      continue;
    }
    if (snapshots.has(watch.characterId)) continue;
    const snap = await readPrivate<Snapshot>(env, watch.characterId);
    const listings = (snap?.retainers ?? []).flatMap((r) => (r.market ?? []).map((m) => ({ retainerId: r.id, retainer: r.name, ...m })));
    snapshots.set(watch.characterId, snap?.world ? { world: snap.world, listings, sales: snap.sales ?? [] } : null);
  }
  const byWorld = new Map<string, Set<number>>();
  for (const s of snapshots.values())
    if (s) for (const l of s.listings) (byWorld.get(s.world) ?? byWorld.set(s.world, new Set()).get(s.world)!).add(l.id);
  const boards = new Map<string, Map<number, BoardItem>>();
  for (const [world, ids] of byWorld) boards.set(world, await fetchBoard(env, world, [...ids]));

  const pending: { to: string; characterId: number; world: string; events: { listing: MyListing; event: ListingEvent }[] }[] = [];
  for (const index of due) {
    const watch = devices[index].record.retainers;
    const snap = watch ? snapshots.get(watch.characterId) : null;
    if (!watch || !snap) continue;
    const mine = new Set(snap.listings.map((l) => l.retainer));
    const kept: Record<string, ListingMemory> = {};
    const events: { listing: MyListing; event: ListingEvent }[] = [];
    // Ventes vues en direct par le plugin (le joueur était en jeu) : annoncées sans attendre Universalis.
    for (const sale of snap.sales) {
      if (sale.at <= (watch.salesSeen ?? 0)) continue;
      watch.salesSeen = Math.max(watch.salesSeen ?? 0, sale.at);
      const listing: MyListing = { retainerId: sale.retainerId, retainer: sale.retainer, id: sale.id, qty: sale.qty, hq: sale.hq, price: sale.price };
      const known = sale.qty > 0 ? watch.listings[listingKey(listing)] : undefined;
      if (known?.gone || !watch.sold) continue;
      if (known) known.gone = true;
      events.push({ listing, event: { kind: 'sold', gil: sale.gil || undefined } });
    }
    for (const l of snap.listings) {
      const key = listingKey(l);
      const result = checkListing(l, boards.get(snap.world)?.get(l.id), watch.listings[key], mine, watch, now);
      kept[key] = result.memory;
      for (const event of result.events) events.push({ listing: l, event });
    }
    // Les annonces disparues du relevé (reprises à la sonnette) sont oubliées.
    watch.listings = kept;
    if (events.length) pending.push({ to: devices[index].record.pushToken, characterId: watch.characterId, world: snap.world, events });
  }
  if (pending.length) {
    const names = await itemNames(env, [...new Set(pending.flatMap((p) => p.events.map((e) => e.listing.id)))]);
    for (const p of pending) messages.push(...retainerMessages(p.to, p.characterId, p.world, p.events, names));
  }
  return { messages, changed };
}
