/** Quêtes d'une carte, chargées à la demande depuis XIVAPI (lieu du donneur de quête : feuille Level). */
import { searchAll } from '@/api/crafting';
import { fromWorld, getMap, mapData, mapRowIds, MAP_SIZE, type MapPoint } from '@/utils/map';

interface QuestFields {
  Name?: string;
  ClassJobLevel?: number[];
  'EventIconType@as(raw)'?: number;
  IssuerLocation?: { fields?: { X?: number; Z?: number } };
  JournalGenre?: { fields?: { Name?: string } };
}

const FIELDS = 'Name,ClassJobLevel,EventIconType@as(raw),IssuerLocation.X,IssuerLocation.Z,JournalGenre.Name';

/** Icône de quête par défaut (quête annexe disponible). */
const DEFAULT_QUEST_ICON = 71021;

export async function questsOnMap(mapId: number): Promise<MapPoint[]> {
  const map = getMap(mapId);
  if (!map) return [];
  const query = mapRowIds(mapId)
    .map((id) => `IssuerLocation.Map=${id}`)
    .join(' ');
  const rows = await searchAll<QuestFields>('Quest', query, FIELDS, 1500);
  const icons = mapData().questIcons;
  const out: MapPoint[] = [];
  for (const row of rows) {
    const f = row.fields;
    const name = f.Name?.replace(/\u00ad/g, '').trim();
    const location = f.IssuerLocation?.fields;
    if (!name || location?.X === undefined || location.Z === undefined) continue;
    const [x, y] = fromWorld(map, location.X, location.Z);
    if (x < 0 || y < 0 || x > MAP_SIZE || y > MAP_SIZE) continue;
    out.push({
      id: `q${row.row_id}`,
      layer: 'quests',
      x,
      y,
      icon: icons[String(f['EventIconType@as(raw)'] ?? 0)] ?? DEFAULT_QUEST_ICON,
      label: name,
      orientation: 2,
      rank: 3,
      data: {
        type: 'quest',
        questId: row.row_id,
        level: f.ClassJobLevel?.[0] ?? 0,
        genre: f.JournalGenre?.fields?.Name ?? '',
      },
    });
  }
  return out;
}
