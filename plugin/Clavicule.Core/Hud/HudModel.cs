using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Clavicule.Hud;

/// <summary>Écran du jeu : les positions de l'ATH sont en pourcentage de sa taille.</summary>
public sealed record HudScreen(int Width, int Height, float UiScale);

/// <summary>Rectangle affiché par le jeu, en pixels (seulement pour la disposition active, quand l'élément est chargé).</summary>
public sealed record HudRect(float X, float Y, float W, float H, bool Shown);

/// <summary>
/// Élément d'une disposition. X et Y sont en pourcentage de l'écran et désignent le point d'ancrage de l'élément :
/// Anchor va de 0 (coin haut gauche) à 8 (coin bas droit), ligne par ligne. Largeur et hauteur sont à l'échelle 1.
/// </summary>
public sealed record HudElement(
    uint Hash,
    string Addon,
    string Name,
    string Group,
    string? Job,
    int? Hotbar,
    float X,
    float Y,
    float Scale,
    int Width,
    int Height,
    int Anchor,
    bool Visible,
    int Opacity,
    int? Shape,
    HudRect? Live);

public sealed record HudLayout(int Index, string Name, List<HudElement> Elements);

/// <summary>Case non vide d'une barre : type de commande du jeu (action, objet, macro…), identifiant, nom et icône.</summary>
public sealed record HotbarSlotInfo(int Slot, int Type, uint Id, string Name, uint Icon);

/// <summary>Une barre d'actions (0 à 9) ; Shared : la barre est commune à tous les jobs.</summary>
public sealed record HotbarBar(int Id, bool Shared, List<HotbarSlotInfo> Slots);

public sealed record HotbarJob(int Job, string Abbr, string Name, List<HotbarBar> Bars);

public sealed record HotbarSet(int CurrentJob, List<HotbarJob> Jobs);

/// <summary>Relevé de l'ATH envoyé à l'appli.</summary>
public sealed record HudSnapshot(int Schema, DateTime UpdatedAt, HudScreen Screen, int CurrentLayout, List<HudLayout> Layouts, HotbarSet? Hotbars)
{
    public const int CurrentSchema = 1;

    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNameCaseInsensitive = true,
    };

    public string ToJson() => JsonSerializer.Serialize(this, Json);

    /// <summary>Empreinte sans la date ni l'affichage du moment : ne change que si la disposition ou les barres changent.</summary>
    public string ContentHash()
    {
        var stable = this with
        {
            UpdatedAt = default,
            Layouts = Layouts.Select(l => l with { Elements = l.Elements.Select(e => e with { Live = null }).ToList() }).ToList(),
        };
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(stable, Json))));
    }
}

/// <summary>Réglage d'un élément demandé par l'appli ; un champ absent reste tel quel.</summary>
public sealed record HudElementChange(uint Hash, float? X = null, float? Y = null, float? Scale = null, bool? Visible = null,
                                      int? Opacity = null, int? Shape = null);

/// <summary>Nouveau contenu d'une case (Type 0 : la vider).</summary>
public sealed record HotbarSlotChange(int Bar, int Slot, int Type, uint Id);

/// <summary>
/// Modification déposée par l'appli :
/// « layout » règle des éléments d'une disposition, « activate » change de disposition, « hotbars » réorganise les
/// barres d'un job.
/// </summary>
public sealed record HudChange(string Kind, int? Layout = null, List<HudElementChange>? Elements = null, int? Job = null,
                               List<HotbarSlotChange>? Slots = null);

/// <summary>Modification telle que la file du service la rend.</summary>
public sealed record QueuedHudChange(string Id, string Kind, string Status, DateTime CreatedAt, string Device, HudChange Change)
{
    public static IReadOnlyList<QueuedHudChange> ParseList(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var list = new List<QueuedHudChange>();
        foreach (var item in doc.RootElement.GetProperty("changes").EnumerateArray())
        {
            HudChange change;
            try
            {
                change = item.GetProperty("change").Deserialize<HudChange>(HudSnapshot.Json) ?? new HudChange("?");
            }
            catch (JsonException)
            {
                change = new HudChange("?");
            }
            list.Add(new QueuedHudChange(item.GetProperty("id").GetString()!, item.GetProperty("kind").GetString()!,
                                         item.GetProperty("status").GetString()!, item.GetProperty("createdAt").GetDateTime(),
                                         item.TryGetProperty("device", out var d) ? d.GetString() ?? "" : "", change));
        }
        return list;
    }
}
