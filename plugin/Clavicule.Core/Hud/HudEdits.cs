namespace Clavicule.Hud;

/// <summary>
/// Copie des champs d'un élément de disposition du jeu (AddonConfigEntry, 36 octets) que l'appli peut régler.
/// Options : 4 octets propres à l'élément (pour une barre d'actions, l'octet 1 est sa forme, 12×1 à 1×12).
/// Visibility : bit 1 = affiché au clavier, bit 2 = affiché à la manette.
/// </summary>
public struct HudEntry
{
    public uint Hash;
    public float X;
    public float Y;
    public float Scale;
    public uint Options;
    public ushort Width;
    public ushort Height;
    public byte Anchor;
    public byte Visibility;
    public byte Alpha;
}

public static class HudEdits
{
    /// <summary>Tailles proposées par l'éditeur d'ATH du jeu.</summary>
    public static readonly float[] Scales = [0.6f, 0.8f, 0.9f, 1.0f, 1.1f, 1.2f, 1.4f, 1.6f, 1.8f, 2.0f];

    public const byte VisibleKeyboard = 1;
    public const byte VisibleGamepad = 2;

    /// <summary>Taille d'une barre d'actions (à l'échelle 1) selon sa forme : 1 = 12×1 … 6 = 1×12.</summary>
    public static (ushort Width, ushort Height) HotbarSize(int shape) => shape switch
    {
        1 => (624, 72),
        2 => (331, 121),
        3 => (241, 170),
        4 => (162, 260),
        5 => (117, 358),
        6 => (72, 618),
        _ => throw new ArgumentOutOfRangeException(nameof(shape)),
    };

    public static bool IsVisible(byte visibility) => (visibility & (VisibleKeyboard | VisibleGamepad)) != 0;

    public static int ShapeOf(uint options) => (int)((options >> 8) & 0xFF);

    /// <summary>Taille autorisée la plus proche.</summary>
    public static float SnapScale(float scale) => Scales.MinBy(s => Math.Abs(s - scale));

    /// <summary>
    /// Applique un réglage à un élément, en gardant les valeurs dans ce que le jeu accepte. Rend null si tout a été
    /// appliqué, sinon la raison du refus d'une partie.
    /// </summary>
    public static string? Apply(ref HudEntry entry, HudElementChange change, HudElementInfo info)
    {
        string? refused = null;
        if (change.X is { } x)
        {
            if (float.IsFinite(x)) entry.X = Math.Clamp(x, 0f, 100f);
            else refused = "position invalide";
        }
        if (change.Y is { } y)
        {
            if (float.IsFinite(y)) entry.Y = Math.Clamp(y, 0f, 100f);
            else refused = "position invalide";
        }
        if (change.Scale is { } scale)
        {
            if (float.IsFinite(scale)) entry.Scale = SnapScale(scale);
            else refused = "taille invalide";
        }
        if (change.Visible is { } visible)
        {
            const byte both = VisibleKeyboard | VisibleGamepad;
            entry.Visibility = visible ? (byte)(entry.Visibility | both) : (byte)(entry.Visibility & ~both);
        }
        if (change.Opacity is { } opacity)
        {
            // Le jeu ne propose pas d'opacité pour les jauges de job.
            if (info.Group == HudGroup.Gauge) refused = "opacité non réglable pour une jauge";
            else entry.Alpha = (byte)Math.Clamp(opacity, 1, 255);
        }
        if (change.Shape is { } shape)
        {
            if (info.Hotbar == null || shape is < 1 or > 6)
            {
                refused = "forme réservée aux barres d'actions 1 à 10";
            }
            else
            {
                entry.Options = (entry.Options & 0xFFFF00FFu) | ((uint)shape << 8);
                (entry.Width, entry.Height) = HotbarSize(shape);
            }
        }
        return refused;
    }
}

/// <summary>Réorganisation des barres d'actions : seulement déplacer, échanger ou vider des cases existantes.</summary>
public static class HotbarEdits
{
    public const int Bars = 10;
    public const int SlotsPerBar = 12;

    /// <summary>
    /// Garde les changements sûrs : case dans les barres 1 à 10, et contenu vide ou déjà présent dans les barres de
    /// ce job. L'appli ne peut donc rien ajouter que le joueur n'avait pas déjà placé.
    /// </summary>
    public static (List<HotbarSlotChange> Accepted, int Rejected) Validate(HotbarJob job, IEnumerable<HotbarSlotChange> changes)
    {
        var existing = job.Bars.SelectMany(b => b.Slots).Select(s => (s.Type, s.Id)).ToHashSet();
        var accepted = new List<HotbarSlotChange>();
        var rejected = 0;
        foreach (var change in changes)
        {
            var inRange = change.Bar is >= 0 and < Bars && change.Slot is >= 0 and < SlotsPerBar;
            var known = change.Type == 0 || existing.Contains((change.Type, change.Id));
            if (inRange && known) accepted.Add(change with { Id = change.Type == 0 ? 0 : change.Id });
            else rejected++;
        }
        // Une seule valeur par case : la dernière demandée.
        accepted = accepted.GroupBy(c => (c.Bar, c.Slot)).Select(g => g.Last()).ToList();
        return (accepted, rejected);
    }
}
