using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Clavicule.Private;

/// <summary>Objets d'un même type dans un groupe (les piles identiques sont additionnées).</summary>
public sealed record ItemStack(uint Id, int Qty, bool Hq)
{
    /// <summary>Additionne les piles d'un même objet (même qualité) et trie par identifiant.</summary>
    public static List<ItemStack> Merge(IEnumerable<ItemStack> stacks) =>
        stacks.Where(s => s.Id != 0 && s.Qty > 0)
              .GroupBy(s => (s.Id, s.Hq))
              .Select(g => new ItemStack(g.Key.Id, g.Sum(s => s.Qty), g.Key.Hq))
              .OrderBy(s => s.Id)
              .ThenBy(s => s.Hq)
              .ToList();
}

/// <summary>Un ensemble d'objets : sacs, arsenal, cristaux, inventaire d'un servant…</summary>
public sealed record ItemGroup(string Key, string Label, DateTime UpdatedAt, List<ItemStack> Items);

/// <summary>Objet mis en vente par un servant.</summary>
public sealed record MarketListing(uint Id, int Qty, bool Hq, ulong Price);

public sealed record RetainerInfo(
    string Id,
    string Name,
    int ClassJob,
    int Level,
    uint Gil,
    int ItemCount,
    int MarketItemCount,
    int Town,
    int VentureId,
    /// <summary>Fin de la mission en cours (secondes Unix), 0 si aucune.</summary>
    long VentureComplete,
    /// <summary>Dernière fois que son inventaire a été vu à la sonnette (null : jamais).</summary>
    DateTime? SeenAt,
    List<ItemStack>? Items,
    List<ItemStack>? Crystals,
    List<MarketListing>? Market);

public sealed record Letter(string Sender, long Timestamp, string Preview, bool Read, uint Gil, List<ItemStack> Attachments);

public sealed record Mailbox(DateTime UpdatedAt, List<Letter> Letters);

/// <summary>Élément possédé d'une collection : identifiant dans la feuille du jeu, nom (langue du jeu) et icône.</summary>
public sealed record CollectionEntry(uint Id, string Name, uint Icon);

/// <summary>Une collection (montures, mascottes…) : total des éléments obtenables et ceux possédés.</summary>
public sealed record CollectionInfo(string Key, string Label, int Total, List<CollectionEntry> Owned);

/// <summary>Hauts faits : le jeu ne les charge qu'à la demande, d'où la date du dernier relevé.</summary>
public sealed record AchievementSummary(DateTime UpdatedAt, int Count, int Total, int Points, int PointsTotal);

/// <summary>Tout ce que l'appli peut afficher sur les données privées du personnage.</summary>
public sealed record PrivateSnapshot(
    int Schema,
    DateTime UpdatedAt,
    string Name,
    string World,
    uint Gil,
    Dictionary<string, uint> Currencies,
    List<ItemGroup> Inventories,
    List<RetainerInfo> Retainers,
    Mailbox? Mail,
    List<CollectionInfo>? Collections = null,
    AchievementSummary? Achievements = null,
    DutyProgress? Duties = null,
    List<RetainerSale>? Sales = null)
{
    public const int CurrentSchema = 1;

    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    public string ToJson() => JsonSerializer.Serialize(this, Json);

    /// <summary>Empreinte du contenu, sans la date : sert à n'envoyer que ce qui a changé.</summary>
    public string ContentHash()
    {
        var undated = this with
        {
            UpdatedAt = default,
            Inventories = Inventories.Select(g => g with { UpdatedAt = default }).ToList(),
            Mail = Mail == null ? null : Mail with { UpdatedAt = default },
            Achievements = Achievements == null ? null : Achievements with { UpdatedAt = default },
            Duties = Duties == null ? null : Duties with { UpdatedAt = default },
        };
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(undated, Json))))[..16];
    }
}

/// <summary>
/// Mémoire du plugin entre deux relevés : les inventaires des servants et le courrier ne sont lisibles
/// qu'à certains moments (sonnette, boîte aux lettres) ; on garde la dernière version vue.
/// </summary>
public sealed class PrivateMemory
{
    public Dictionary<string, RetainerInfo> Retainers { get; set; } = new();
    public Mailbox? Mail { get; set; }
    /// <summary>Derniers contenus vus de chaque groupe (les sacoches ne sont chargées qu'après ouverture).</summary>
    public Dictionary<string, ItemGroup> Inventories { get; set; } = new();
    /// <summary>Derniers hauts faits connus (chargés par le jeu seulement sur demande).</summary>
    public AchievementSummary? Achievements { get; set; }

    /// <summary>Carnet de Khloé vu cette semaine (pour savoir s'il a été rendu).</summary>
    public BingoMemory? Bingo { get; set; }

    /// <summary>Ventes des servants annoncées dans le chat (les plus récentes).</summary>
    public List<RetainerSale> Sales { get; set; } = new();

    /// <summary>Marques A et S vues mortes près du joueur.</summary>
    public List<HuntKill> HuntKills { get; set; } = new();

    /// <summary>Dernière version vue des collections que le jeu ne charge qu'à certains moments (titres, armoire).</summary>
    public Dictionary<string, CollectionInfo> Collections { get; set; } = new();

    /// <summary>Complète les collections lues avec la dernière version connue de celles qui ne l'ont pas été.</summary>
    public List<CollectionInfo>? MergeCollections(List<CollectionInfo>? live)
    {
        if (live == null) return Collections.Count > 0 ? Collections.Values.ToList() : null;
        foreach (var c in live) Collections[c.Key] = c;
        return live.Concat(Collections.Values.Where(known => live.All(c => c.Key != known.Key))).ToList();
    }

    public AchievementSummary? MergeAchievements(AchievementSummary? live)
    {
        if (live != null) Achievements = live;
        return Achievements;
    }

    /// <summary>Garde le contenu lu s'il est disponible, sinon le dernier connu.</summary>
    public ItemGroup? MergeGroup(string key, ItemGroup? live)
    {
        if (live != null) Inventories[key] = live;
        return Inventories.GetValueOrDefault(key);
    }

    /// <summary>
    /// Met à jour la liste des servants (toujours lisible) en conservant l'inventaire vu à la sonnette.
    /// `opened` : le servant actuellement ouvert à la sonnette, avec son inventaire, s'il y en a un.
    /// </summary>
    public List<RetainerInfo> MergeRetainers(IReadOnlyList<RetainerInfo> listed, RetainerInfo? opened)
    {
        if (opened != null) Retainers[opened.Id] = opened;
        var result = new List<RetainerInfo>();
        foreach (var r in listed)
        {
            Retainers.TryGetValue(r.Id, out var known);
            var merged = r with
            {
                SeenAt = known?.SeenAt,
                Items = known?.Items,
                Crystals = known?.Crystals,
                Market = known?.Market,
            };
            Retainers[r.Id] = merged;
            result.Add(merged);
        }
        // Servants congédiés : oubliés.
        foreach (var id in Retainers.Keys.Except(listed.Select(r => r.Id)).ToList()) Retainers.Remove(id);
        return result;
    }

    public string ToJson() => JsonSerializer.Serialize(this, PrivateSnapshot.Json);

    public static PrivateMemory FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new PrivateMemory();
        try
        {
            return JsonSerializer.Deserialize<PrivateMemory>(json, PrivateSnapshot.Json) ?? new PrivateMemory();
        }
        catch (JsonException)
        {
            return new PrivateMemory();
        }
    }
}
