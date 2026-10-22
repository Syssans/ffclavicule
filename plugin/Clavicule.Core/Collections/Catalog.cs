using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Clavicule.Private;

namespace Clavicule.Collections;

/// <summary>Façons d'obtenir un objet de collection (clés stables ; l'appli les traduit).</summary>
public static class SourceType
{
    public const string Achievement = "achievement";
    public const string Crafting = "crafting";
    public const string Purchase = "purchase";
    public const string GoldSaucer = "gold-saucer";
    public const string Pvp = "pvp";
    public const string Hunts = "hunts";
    public const string Fate = "fate";
    public const string Skybuilders = "skybuilders";
    public const string WondrousTails = "wondrous-tails";
    public const string Island = "island";
    public const string VariantDungeon = "vc-dungeon";
    public const string Quest = "quest";
    public const string Event = "event";
    public const string Premium = "premium";
    public const string Dungeon = "dungeon";
    public const string Trial = "trial";
    public const string Raid = "raid";
    public const string Other = "other";
}

/// <summary>Une façon d'obtenir l'élément : type, texte (prix, nom de quête, de haut fait…), et s'il n'est plus disponible.</summary>
public sealed record CatalogSource(string Type, string Text, bool Limited = false);

/// <summary>
/// Élément d'une collection, possédé ou non. Item : objet qui le débloque (null s'il n'y en a pas) ;
/// Tradeable : cet objet se vend au tableau des ventes.
/// </summary>
public sealed record CatalogEntry(uint Id, string Name, uint Icon, uint? Item, bool Tradeable, List<CatalogSource> Sources);

public sealed record CatalogCollection(string Key, string Label, List<CatalogEntry> Items);

/// <summary>
/// Tout ce qui existe dans chaque collection et comment l'obtenir, tiré des données du jeu. Ne dépend pas du
/// personnage : envoyé seulement quand il change (nouvelle version du jeu ou du plugin).
/// </summary>
public sealed record CollectionCatalog(int Schema, DateTime BuiltAt, string GameVersion, List<CatalogCollection> Collections)
{
    public const int CurrentSchema = 1;

    public string ToJson() => JsonSerializer.Serialize(this, PrivateSnapshot.Json);

    public string ContentHash() =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(this with { BuiltAt = default }, PrivateSnapshot.Json))))[..16];
}

/// <summary>
/// Règles de provenance, reprises de FFXIV Collect (licence MIT, lib/tasks/sources) : les monnaies d'une boutique
/// disent d'où vient l'objet (marques de loup : JcJ, points du Gold Saucer…).
/// </summary>
public static class SourceRules
{
    private static readonly CultureInfo French = CultureInfo.GetCultureInfo("fr-FR");

    private static readonly string[] Crafters = ["menuisier", "forgeron", "armurier", "orfèvre", "tanneur", "couturier", "alchimiste", "cuisinier"];

    /// <summary>Type de provenance selon l'objet demandé en paiement dans une boutique spéciale.</summary>
    public static string ForCurrency(uint currencyItemId) => currencyItemId switch
    {
        25 or 36656 => SourceType.Pvp,
        27 or 10307 or 26533 => SourceType.Hunts,
        29 or 41629 => SourceType.GoldSaucer,
        26807 => SourceType.Fate,
        28063 => SourceType.Skybuilders,
        30341 => SourceType.WondrousTails,
        37549 => SourceType.Island,
        38533 or 39884 or 41078 => SourceType.VariantDungeon,
        _ => SourceType.Purchase,
    };

    /// <summary>Objet correspondant à un type d'assignat (coût de type 3 dans les boutiques spéciales).</summary>
    public static uint? ScripItem(uint scripType) => scripType switch
    {
        1 => 25199,
        2 => 33913,
        3 => 25200,
        4 => 33914,
        5 => 10307,
        6 => 41784,
        7 => 41785,
        _ => null,
    };

    /// <summary>Type de provenance d'un rouleau d'orchestrion selon sa catégorie dans le jeu.</summary>
    public static (string Type, bool Limited) ForOrchestrionCategory(uint category) => category switch
    {
        3 or 12 => (SourceType.Dungeon, false),
        4 => (SourceType.Trial, false),
        5 or 10 => (SourceType.Raid, false),
        7 => (SourceType.Event, true),
        8 => (SourceType.Premium, false),
        11 => (SourceType.Purchase, false),
        13 => (SourceType.Quest, false),
        _ => (SourceType.Other, false),
    };

    public static string CraftedBy(int craftType) =>
        craftType >= 0 && craftType < Crafters.Length ? $"Fabriqué par un {Crafters[craftType]}" : "Fabriqué par un artisan";

    /// <summary>« 12 000 gils », « 1 point du Gold Saucer »… (espaces insécables comme en français).</summary>
    public static string Price(ulong amount, string currency) => $"{amount.ToString("N0", French)} {currency}".Replace(' ', ' ');

    public static string Seals(ulong amount) => Price(amount, "sceaux de compagnie");

    /// <summary>Ajoute une provenance si elle n'y est pas déjà ; au plus `max` par élément (les boutiques se répètent).</summary>
    public static void Add(List<CatalogSource> sources, CatalogSource source, int max = 5)
    {
        if (string.IsNullOrWhiteSpace(source.Text) || sources.Count >= max) return;
        if (sources.Any(s => s.Type == source.Type && s.Text == source.Text)) return;
        sources.Add(source);
    }
}
