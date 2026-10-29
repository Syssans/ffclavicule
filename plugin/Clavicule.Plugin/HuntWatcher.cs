using Clavicule.Private;
using Dalamud.Game.ClientState.Objects.Types;
using Dalamud.Plugin.Services;
using FFXIVClientStructs.FFXIV.Client.Game.UI;
using Lumina.Excel.Sheets;

namespace Clavicule.Plugin;

/// <summary>
/// Chasse : contrats en main (avec les victimes) et marques A/S vues mortes près du joueur. Les marques de chaque
/// zone et les victimes demandées viennent des données du jeu.
/// </summary>
public sealed unsafe class HuntWatcher
{
    /// <summary>Territoire -> marque (BNpcName) -> rang « A » ou « S ».</summary>
    private readonly Dictionary<uint, Dictionary<uint, string>> marksByTerritory = new();

    /// <summary>Contrat (ligne MobHuntOrder) -> victimes demandées pour chaque cible.</summary>
    private readonly Dictionary<uint, List<int>> neededByOrder = new();

    /// <summary>Type de contrat (index du jeu) -> contrat d'élite ?</summary>
    private readonly SortedDictionary<int, bool> eliteByType = new();

    public HuntWatcher(IDataManager data, IPluginLog log)
    {
        try
        {
            foreach (var territory in data.GetExcelSheet<TerritoryType>())
            {
                if (territory.NotoriousMonsterTerritory.RowId == 0 || !territory.NotoriousMonsterTerritory.IsValid) continue;
                var list = territory.NotoriousMonsterTerritory.Value.NotoriousMonsters;
                var marks = new Dictionary<uint, string>();
                // Les cases 5 à 9 sont l'événement du rang SS (sbires puis SS) : on ne suit que les rangs A et S.
                for (var i = 0; i < Math.Min(5, list.Count); i++)
                {
                    if (list[i].RowId == 0 || !list[i].IsValid) continue;
                    var mark = list[i].Value;
                    var name = mark.BNpcName.RowId;
                    if (name == 0) continue;
                    if (mark.Rank == 2) marks[name] = "A";
                    else if (mark.Rank == 3) marks[name] = "S";
                }
                if (marks.Count > 0) marksByTerritory[territory.RowId] = marks;
            }
            foreach (var type in data.GetExcelSheet<MobHuntOrderType>()) eliteByType[(int)type.RowId] = type.Type == 2;
            foreach (var order in data.GetSubrowExcelSheet<MobHuntOrder>())
                neededByOrder[order.RowId] = order.Where(t => t.Target.RowId != 0).Select(t => (int)t.NeededKills).ToList();
        }
        catch (Exception e)
        {
            log.Warning(e, "Données de chasse illisibles");
        }
    }

    /// <summary>
    /// Regarde les monstres autour du joueur et note les marques A/S mortes. Vrai si une nouvelle mort a été notée.
    /// </summary>
    public bool Scan(IObjectTable objects, uint territory, string world, List<HuntKill> kills, long now)
    {
        if (!marksByTerritory.TryGetValue(territory, out var marks)) return false;
        var changed = false;
        foreach (var o in objects)
        {
            if (o is not IBattleNpc npc || !marks.TryGetValue(npc.NameId, out var rank)) continue;
            if (!npc.IsDead && npc.CurrentHp > 0) continue;
            changed |= HuntKills.Record(kills, new HuntKill((int)territory, (int)npc.NameId, rank, now, world), now);
        }
        return changed;
    }

    /// <summary>Contrats en main : contrat tiré, victimes et victimes demandées pour chaque cible.</summary>
    public List<HuntBill> Bills()
    {
        var hunt = MobHunt.Instance();
        var bills = new List<HuntBill>();
        if (hunt == null) return bills;
        foreach (var (type, elite) in eliteByType)
        {
            if (type > byte.MaxValue || !hunt->IsMarkBillObtained(type)) continue;
            var row = hunt->GetObtainedHuntOrderRowId((byte)type);
            if (row <= 0 || !neededByOrder.TryGetValue((uint)row, out var needed) || needed.Count == 0) continue;
            var kills = new List<int>();
            for (var i = 0; i < needed.Count; i++) kills.Add(hunt->GetKillCount((byte)type, (byte)i));
            bills.Add(new HuntBill(type, row, elite, kills, needed));
        }
        return bills;
    }
}
