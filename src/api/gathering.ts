/** Mandats de récolte (Mineur, Botaniste), d'après les données du jeu (XIVAPI). */
import { searchAll, type CraftLeve } from './crafting';

interface LeveFields {
  Name?: string;
  ClassJobLevel?: number;
  ExpReward?: number;
  GilReward?: number;
  PlaceNameIssued?: { fields?: { Name?: string } };
  LeveClient?: { fields?: { Name?: string } };
}

/** Types d'assignation des mandats : 2 Mineur, 3 Botaniste. */
export async function gatheringLeves(assignmentType: 2 | 3, minLevel: number, maxLevel: number): Promise<CraftLeve[]> {
  const query = `+LeveAssignmentType=${assignmentType} +ClassJobLevel>=${minLevel} +ClassJobLevel<=${maxLevel}`;
  const rows = await searchAll<LeveFields>('Leve', query, 'Name,ClassJobLevel,ExpReward,GilReward,PlaceNameIssued.Name,LeveClient.Name', 300);
  return rows
    .filter((r) => r.fields.Name)
    .map((r) => ({
      id: r.row_id,
      name: r.fields.Name!,
      level: r.fields.ClassJobLevel ?? 0,
      exp: r.fields.ExpReward ?? 0,
      gil: r.fields.GilReward ?? 0,
      place: r.fields.PlaceNameIssued?.fields?.Name || null,
      client: r.fields.LeveClient?.fields?.Name?.replace(/^Client\s*:\s*/, '') || null,
      repeats: 0,
      items: [],
    }))
    .sort((a, b) => b.level - a.level || b.exp - a.exp);
}
