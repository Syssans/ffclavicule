using Clavicule.Collections;
using Dalamud.Utility;
using Lumina.Excel.Sheets;

namespace Clavicule.Plugin;

/// <summary>
/// Catalogue des collections : tout ce qui existe, l'objet qui le débloque, et comment l'obtenir, d'après les
/// données du jeu (recettes, boutiques, récompenses de quêtes et de hauts faits). Méthode reprise de
/// FFXIV Collect (licence MIT). Long à construire : à lancer hors du thread du jeu.
/// </summary>
public sealed partial class CollectionCollector
{
    // Types d'action des objets qui débloquent quelque chose (feuille ItemAction, colonne « Action »).
    private const uint ActionMinion = 853;
    private const uint ActionBarding = 1013;
    private const uint ActionMount = 1322;
    private const uint ActionUnlockLink = 2633; // coiffures et emotes
    private const uint ActionCard = 3357;
    private const uint ActionFashion = 20086;

    public CollectionCatalog BuildCatalog()
    {
        var catalogs = Catalogs();
        var ids = catalogs.ToDictionary(c => c.Key, c => c.Items.Select(i => i.Id).ToHashSet());
        var emoteByLink = data.GetExcelSheet<Emote>().Where(e => e.UnlockLink > 0)
                              .GroupBy(e => e.UnlockLink).ToDictionary(g => g.Key, g => g.First().RowId);

        // 1. Objet → élément de collection qu'il débloque.
        var unlocks = new Dictionary<uint, (string Key, uint Id)>();
        var itemsOf = new Dictionary<(string Key, uint Id), List<Item>>();
        bool Has(string key, uint id) => ids.TryGetValue(key, out var set) && set.Contains(id);
        void Link(Item item, string key, uint id)
        {
            if (!Has(key, id) || !unlocks.TryAdd(item.RowId, (key, id))) return;
            if (!itemsOf.TryGetValue((key, id), out var list)) itemsOf[(key, id)] = list = [];
            list.Add(item);
        }
        foreach (var item in data.GetExcelSheet<Item>())
        {
            if (item.Name.IsEmpty) continue;
            if (item.AdditionalData.Is<Orchestrion>()) Link(item, "orchestrions", item.AdditionalData.RowId);
            else if (item.AdditionalData.Is<Glasses>() && data.GetExcelSheet<Glasses>().GetRowOrDefault(item.AdditionalData.RowId) is { } glasses)
                Link(item, "facewear", glasses.Style.RowId);
            if (item.ItemAction.RowId == 0 || item.ItemAction.ValueNullable is not { } action) continue;
            var key = action.Action.RowId switch
            {
                ActionMinion => "minions",
                ActionBarding => "bardings",
                ActionMount => "mounts",
                ActionCard => "cards",
                ActionFashion => "fashions",
                ActionUnlockLink => "unlock-link",
                _ => null,
            };
            if (key == null) continue;
            foreach (var value in action.Data)
            {
                if (value == 0) continue;
                if (key != "unlock-link") Link(item, key, value);
                else if (Has("hairstyles", value)) Link(item, "hairstyles", value);
                else if (emoteByLink.TryGetValue(value, out var emote)) Link(item, "emotes", emote);
                if (unlocks.ContainsKey(item.RowId)) break;
            }
        }

        // 2. Provenances, par élément.
        var sources = new Dictionary<(string Key, uint Id), List<CatalogSource>>();
        void Source(uint itemId, CatalogSource source)
        {
            if (!unlocks.TryGetValue(itemId, out var target)) return;
            if (!sources.TryGetValue(target, out var list)) sources[target] = list = [];
            SourceRules.Add(list, source);
        }
        void Direct(string key, uint id, CatalogSource source)
        {
            if (!Has(key, id)) return;
            if (!sources.TryGetValue((key, id), out var list)) sources[(key, id)] = list = [];
            SourceRules.Add(list, source);
        }

        foreach (var achievement in data.GetExcelSheet<Achievement>())
        {
            if (achievement.Item.RowId != 0 && !achievement.Name.IsEmpty)
                Source(achievement.Item.RowId, new CatalogSource(SourceType.Achievement, achievement.Name.ExtractText()));
        }

        foreach (var quest in data.GetExcelSheet<Quest>())
        {
            if (quest.Name.IsEmpty) continue;
            var seasonal = quest.Festival.RowId != 0;
            foreach (var reward in quest.Reward)
            {
                if (reward.RowId == 0 || !unlocks.ContainsKey(reward.RowId)) continue;
                Source(reward.RowId, new CatalogSource(seasonal ? SourceType.Event : SourceType.Quest, quest.Name.ExtractText(), seasonal));
            }
        }

        foreach (var recipe in data.GetExcelSheet<Recipe>())
        {
            if (recipe.ItemResult.RowId != 0 && unlocks.ContainsKey(recipe.ItemResult.RowId))
                Source(recipe.ItemResult.RowId, new CatalogSource(SourceType.Crafting, SourceRules.CraftedBy((int)recipe.CraftType.RowId)));
        }

        var gil = CurrencyName(1, 2);
        foreach (var shop in data.GetSubrowExcelSheet<GilShopItem>())
        {
            foreach (var entry in shop)
            {
                if (unlocks.ContainsKey(entry.Item.RowId) && entry.Item.ValueNullable is { PriceMid: > 0 } item)
                    Source(entry.Item.RowId, new CatalogSource(SourceType.Purchase, SourceRules.Price(item.PriceMid, gil)));
            }
        }

        foreach (var shop in data.GetSubrowExcelSheet<GCScripShopItem>())
        {
            foreach (var entry in shop)
            {
                if (unlocks.ContainsKey(entry.Item.RowId) && entry.CostGCSeals > 0)
                    Source(entry.Item.RowId, new CatalogSource(SourceType.Purchase, SourceRules.Seals(entry.CostGCSeals)));
            }
        }

        var tomestones = data.GetExcelSheet<TomestonesItem>().Where(t => t.Tomestones.RowId != 0)
                             .GroupBy(t => t.Tomestones.RowId).ToDictionary(g => g.Key, g => g.First().Item.RowId);
        foreach (var shop in data.GetExcelSheet<SpecialShop>())
        {
            foreach (var entry in shop.Item)
            {
                var cost = entry.ItemCosts.FirstOrDefault(c => c.CurrencyCost > 0 && c.ItemCost.RowId != 0);
                if (cost.CurrencyCost == 0) continue;
                uint? currency = cost.CostType switch
                {
                    0 or 1 => cost.ItemCost.RowId,
                    2 => tomestones.TryGetValue(cost.ItemCost.RowId, out var t) ? t : null,
                    3 => SourceRules.ScripItem(cost.ItemCost.RowId),
                    _ => null,
                };
                if (currency is not { } currencyId) continue;
                var name = CurrencyName(currencyId, cost.CurrencyCost);
                // Récompenses du trésor des Mogs (mémoquartz irréguliers) : événement passé, pas une boutique.
                if (name.Length == 0 || name.Contains("irrégulier", StringComparison.OrdinalIgnoreCase)) continue;
                foreach (var receive in entry.ReceiveItems)
                {
                    if (receive.Item.RowId != 0 && unlocks.ContainsKey(receive.Item.RowId))
                        Source(receive.Item.RowId, new CatalogSource(SourceRules.ForCurrency(currencyId), SourceRules.Price(cost.CurrencyCost, name)));
                }
            }
        }

        // Rouleaux d'orchestrion : leur description dit où les trouver.
        var orchestrionUi = data.GetExcelSheet<OrchestrionUiparam>();
        foreach (var roll in data.GetExcelSheet<Orchestrion>())
        {
            if (roll.Description.IsEmpty || orchestrionUi.GetRowOrDefault(roll.RowId) is not { } ui) continue;
            var (type, limited) = SourceRules.ForOrchestrionCategory(ui.OrchestrionCategory.RowId);
            Direct("orchestrions", roll.RowId, new CatalogSource(type, roll.Description.ExtractText(), limited));
        }

        // Cartes : le jeu dit si elles viennent d'un haut fait ou d'un paquet du Gold Saucer.
        var achievements = data.GetExcelSheet<Achievement>();
        var items = data.GetExcelSheet<Item>();
        foreach (var card in data.GetExcelSheet<TripleTriadCardResident>())
        {
            var acquisition = card.Acquisition.RowId;
            switch (card.AcquisitionType.RowId)
            {
                case 11 when achievements.GetRowOrDefault(acquisition) is { } a:
                    Direct("cards", card.RowId, new CatalogSource(SourceType.Achievement, a.Name.ExtractText()));
                    break;
                case 8 when items.GetRowOrDefault(acquisition) is { } pack:
                    Direct("cards", card.RowId, new CatalogSource(SourceType.GoldSaucer, pack.Name.ExtractText()));
                    break;
            }
        }

        // 3. Catalogue final.
        var collections = catalogs.Select(c => new CatalogCollection(c.Key, c.Label, c.Items.Select(candidate =>
        {
            itemsOf.TryGetValue((c.Key, candidate.Id), out var linked);
            var best = linked?.OrderByDescending(i => i.ItemSearchCategory.RowId != 0).First();
            return new CatalogEntry(candidate.Id, candidate.Name, candidate.Icon, best?.RowId, best is { ItemSearchCategory.RowId: not 0 },
                                    sources.GetValueOrDefault((c.Key, candidate.Id)) ?? []);
        }).ToList())).ToList();

        var version = data.GameData.Repositories.TryGetValue("ffxiv", out var repo) ? repo.Version : "?";
        var catalog = new CollectionCatalog(CollectionCatalog.CurrentSchema, DateTime.UtcNow, version, collections);
        log.Information("Catalogue des collections : {Items} éléments, {Sources} avec provenance, {Linked} avec objet",
                        collections.Sum(c => c.Items.Count), collections.Sum(c => c.Items.Count(i => i.Sources.Count > 0)),
                        collections.Sum(c => c.Items.Count(i => i.Item != null)));
        return catalog;
    }

    /// <summary>Nom d'une monnaie (objet), au pluriel si besoin : « gils », « marques de loup ».</summary>
    private string CurrencyName(uint itemId, uint amount)
    {
        if (data.GetExcelSheet<Item>().GetRowOrDefault(itemId) is not { } item) return "";
        var plural = item.Plural.ExtractText();
        var name = amount > 1 && plural.Length > 0 ? plural : item.Singular.ExtractText();
        return name.Length > 0 ? name : item.Name.ExtractText();
    }
}
