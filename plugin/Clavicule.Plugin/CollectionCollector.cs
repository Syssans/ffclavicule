using Clavicule.Private;
using Dalamud.Plugin.Services;
using Dalamud.Utility;
using FFXIVClientStructs.FFXIV.Client.Game.UI;
using Lumina.Excel.Sheets;
using AchievementState = FFXIVClientStructs.FFXIV.Client.Game.UI.Achievement;

namespace Clavicule.Plugin;

/// <summary>
/// Collections du personnage (montures, mascottes, emotes…) et hauts faits, lus dans le jeu.
/// La liste de ce qui existe vient des données du jeu ; elle est construite une fois, puis seul
/// « possédé ou pas » est relu à chaque relevé. À appeler sur le thread du jeu.
/// </summary>
public sealed unsafe class CollectionCollector(IDataManager data, IPluginLog log)
{
    private sealed record Candidate(uint Id, string Name, uint Icon, uint Check);

    private sealed record Catalog(string Key, string Label, List<Candidate> Items, Func<uint, bool> IsOwned);

    private List<Catalog>? catalogs;
    private (List<uint> Ids, int Points)? achievements;

    private static string Cap(string text) => text.Length == 0 ? text : char.ToUpperInvariant(text[0]) + text[1..];

    private List<Catalog> Catalogs() => catalogs ??= Build();

    private List<Catalog> Build()
    {
        var list = new List<Catalog>();
        void Add(string key, string label, Func<List<Candidate>> items, Func<uint, bool> owned)
        {
            try
            {
                list.Add(new Catalog(key, label, items(), owned));
            }
            catch (Exception e)
            {
                // Une feuille qui change de forme avec une mise à jour du jeu ne doit pas bloquer les autres.
                log.Warning(e, "Collection {Key} illisible", key);
            }
        }

        // Icônes d'objets : rouleaux d'orchestrion et cartes n'ont pas d'icône dans leur propre feuille.
        var orchestrionIcons = new Dictionary<uint, uint>();
        var cardIcons = new Dictionary<uint, uint>();
        foreach (var item in data.GetExcelSheet<Item>())
        {
            if (item.Icon == 0) continue;
            if (item.AdditionalData.Is<Orchestrion>()) orchestrionIcons.TryAdd(item.AdditionalData.RowId, item.Icon);
            else if (item.AdditionalData.Is<TripleTriadCard>()) cardIcons.TryAdd(item.AdditionalData.RowId, item.Icon);
        }

        Add("mounts", "Montures",
            () => data.GetExcelSheet<Mount>()
                      .Where(r => r.Icon != 0 && r.UIPriority > 0 && !r.Singular.IsEmpty)
                      .Select(r => new Candidate(r.RowId, Cap(r.Singular.ExtractText()), r.Icon, r.RowId)).ToList(),
            id => PlayerState.Instance()->IsMountUnlocked(id));

        Add("minions", "Mascottes",
            () => data.GetExcelSheet<Companion>()
                      .Where(r => r.Icon != 0 && !r.Singular.IsEmpty)
                      .Select(r => new Candidate(r.RowId, Cap(r.Singular.ExtractText()), r.Icon, r.RowId)).ToList(),
            id => UIState.Instance()->IsCompanionUnlocked(id));

        Add("orchestrions", "Rouleaux d’orchestrion",
            () =>
            {
                var ui = data.GetExcelSheet<OrchestrionUiparam>();
                return data.GetExcelSheet<Orchestrion>()
                           .Where(r => !r.Name.IsEmpty && ui.GetRowOrDefault(r.RowId) is { } p && p.OrchestrionCategory.RowId > 0)
                           .Select(r => new Candidate(r.RowId, r.Name.ExtractText(), orchestrionIcons.GetValueOrDefault(r.RowId), r.RowId)).ToList();
            },
            id => PlayerState.Instance()->IsOrchestrionRollUnlocked(id));

        Add("emotes", "Emotes",
            () => data.GetExcelSheet<Emote>()
                      .Where(r => r.UnlockLink > 0 && r.Order > 0 && !r.Name.IsEmpty)
                      .Select(r => new Candidate(r.RowId, r.Name.ExtractText(), r.Icon, r.RowId)).ToList(),
            id => UIState.Instance()->IsEmoteUnlocked((ushort)id));

        Add("hairstyles", "Coiffures",
            () => data.GetExcelSheet<CharaMakeCustomize>()
                      .Where(r => r.IsPurchasable && r.UnlockLink > 0)
                      .GroupBy(r => (uint)r.UnlockLink)
                      .Select(g =>
                      {
                          var r = g.First();
                          var name = r.HintItem.ValueNullable?.Name.ExtractText();
                          return new Candidate(g.Key, string.IsNullOrEmpty(name) ? $"Coiffure {r.FeatureID}" : name, r.Icon, g.Key);
                      }).ToList(),
            link => UIState.Instance()->IsUnlockLinkUnlocked(link));

        Add("bardings", "Bardes de chocobo",
            () => data.GetExcelSheet<BuddyEquip>()
                      .Where(r => r.Order > 0 && !r.Name.IsEmpty)
                      .Select(r => new Candidate(r.RowId, r.Name.ExtractText(), r.IconHead != 0 ? r.IconHead : r.IconBody != 0 ? r.IconBody : r.IconLegs, r.RowId)).ToList(),
            id => UIState.Instance()->Buddy.CompanionInfo.IsBuddyEquipUnlocked(id));

        Add("fashions", "Accessoires de mode",
            () => data.GetExcelSheet<Ornament>()
                      .Where(r => r.Order > 0 && !r.Singular.IsEmpty)
                      .Select(r => new Candidate(r.RowId, Cap(r.Singular.ExtractText()), r.Icon, r.RowId)).ToList(),
            id => PlayerState.Instance()->IsOrnamentUnlocked(id));

        Add("facewear", "Accessoires de visage",
            () =>
            {
                var styles = data.GetExcelSheet<GlassesStyle>();
                return data.GetExcelSheet<Glasses>()
                           .Where(g => !g.Name.IsEmpty)
                           .Select(g => g.Style.RowId).Distinct()
                           .Select(id => styles.GetRowOrDefault(id))
                           .Where(s => s is { } st && !st.Name.IsEmpty)
                           .Select(s => new Candidate(s!.Value.RowId, s.Value.Name.ExtractText(), (uint)s.Value.Icon, s.Value.RowId)).ToList();
            },
            id => PlayerState.Instance()->IsGlassesStyleUnlocked((ushort)id));

        Add("cards", "Cartes Triple Triade",
            () =>
            {
                var resident = data.GetExcelSheet<TripleTriadCardResident>();
                return data.GetExcelSheet<TripleTriadCard>()
                           .Where(r => !r.Name.IsEmpty && resident.GetRowOrDefault(r.RowId) is { Order: > 0 })
                           .Select(r => new Candidate(r.RowId, r.Name.ExtractText(), cardIcons.GetValueOrDefault(r.RowId, 88000 + r.RowId), r.RowId)).ToList();
            },
            id => UIState.Instance()->IsTripleTriadCardUnlocked((ushort)id));

        Add("spells", "Sorts de mage bleu",
            () =>
            {
                var transient = data.GetExcelSheet<AozActionTransient>();
                return data.GetExcelSheet<AozAction>()
                           .Where(r => r.Action.RowId > 0 && r.Action.ValueNullable is { } a && !a.Name.IsEmpty)
                           .Select(r =>
                           {
                               var action = r.Action.Value;
                               return new Candidate(r.RowId, action.Name.ExtractText(), transient.GetRowOrDefault(r.RowId)?.Icon ?? action.Icon,
                                                    action.UnlockLink.RowId);
                           }).ToList();
            },
            link => UIState.Instance()->IsUnlockLinkUnlocked(link));

        log.Information("Collections : {Count} catalogues ({Items} éléments)", list.Count, list.Sum(c => c.Items.Count));
        return list;
    }

    /// <summary>Collections possédées ; null si le personnage n'est pas encore chargé.</summary>
    public List<CollectionInfo>? Collect()
    {
        var player = PlayerState.Instance();
        if (player == null || !player->IsLoaded || UIState.Instance() == null) return null;
        var result = new List<CollectionInfo>();
        foreach (var catalog in Catalogs())
        {
            var owned = catalog.Items.Where(c => catalog.IsOwned(c.Check))
                               .Select(c => new CollectionEntry(c.Id, c.Name, c.Icon))
                               .ToList();
            result.Add(new CollectionInfo(catalog.Key, catalog.Label, catalog.Items.Count, owned));
        }
        return result;
    }

    /// <summary>Hauts faits, si le jeu les a chargés ; sinon null (l'appelant garde la dernière version connue).</summary>
    public AchievementSummary? CollectAchievements(DateTime now)
    {
        var state = AchievementState.Instance();
        if (state == null || !state->IsLoaded()) return null;
        achievements ??= BuildAchievements();
        var (ids, pointsTotal) = achievements.Value;
        var sheet = data.GetExcelSheet<Lumina.Excel.Sheets.Achievement>();
        var count = 0;
        var points = 0;
        foreach (var id in ids)
        {
            if (!state->IsComplete((int)id)) continue;
            count++;
            points += sheet.GetRow(id).Points;
        }
        return new AchievementSummary(now, count, ids.Count, points, pointsTotal);
    }

    private (List<uint>, int) BuildAchievements()
    {
        var valid = data.GetExcelSheet<Lumina.Excel.Sheets.Achievement>()
                        .Where(r => !r.Name.IsEmpty && r.AchievementCategory.RowId > 0)
                        .ToList();
        return (valid.Select(r => r.RowId).ToList(), valid.Sum(r => r.Points));
    }

    /// <summary>
    /// Demande au serveur la liste des hauts faits, comme le fait la fenêtre « Hauts faits » du jeu.
    /// Rend vrai si une demande a été envoyée.
    /// </summary>
    public static bool RequestAchievements()
    {
        var state = AchievementState.Instance();
        if (state == null || state->IsLoaded()) return false;
        state->RequestCompletedAchievements();
        return true;
    }
}
