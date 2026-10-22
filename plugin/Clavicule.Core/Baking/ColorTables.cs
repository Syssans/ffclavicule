using System.Numerics;
using System.Text.Json.Nodes;

namespace Clavicule.Baking;

/// <summary>Ligne de table de couleurs (teintures déjà appliquées par le jeu), couleurs en linéaire.</summary>
public readonly record struct ColorRow(Vector3 Diffuse, Vector3 Emissive, float Roughness, float Metalness)
{
    public static ColorRow Lerp(ColorRow a, ColorRow b, float t) => new(
        Vector3.Lerp(a.Diffuse, b.Diffuse, t),
        Vector3.Lerp(a.Emissive, b.Emissive, t),
        float.Lerp(a.Roughness, b.Roughness, t),
        float.Lerp(a.Metalness, b.Metalness, t));
}

/// <summary>Table de Dawntrail (32 lignes) : la texture d'index choisit une paire de lignes et leur mélange.</summary>
public sealed class ColorTable
{
    public IReadOnlyList<ColorRow> Rows { get; }

    public ColorTable(IReadOnlyList<ColorRow> rows) => Rows = rows;

    public static ColorTable? Parse(JsonNode? node)
    {
        var rows = ReadRows(node, legacy: false);
        return rows is { Count: >= 2 } ? new ColorTable(rows) : null;
    }

    /// <summary>R : paire (par pas de 17), G : poids de la première ligne de la paire.</summary>
    public ColorRow Sample(byte red, byte green)
    {
        var pairs = Rows.Count / 2;
        var pair = Math.Clamp((int)MathF.Round(red / 17f), 0, pairs - 1);
        var row0 = Rows[pair * 2];
        var row1 = Rows[pair * 2 + 1];
        return ColorRow.Lerp(row1, row0, green / 255f);
    }

    internal static List<ColorRow>? ReadRows(JsonNode? node, bool legacy)
    {
        // Meddle écrit { "ColorTable": { "Rows": [...] }, "ColorDyeTable": ... }.
        if (node?["ColorTable"]?["Rows"] is not JsonArray rows) return null;
        var list = new List<ColorRow>(rows.Count);
        foreach (var row in rows)
        {
            if (row is not JsonObject r) return null;
            var roughness = legacy ? GlossToRoughness(Number(r, "GlossStrength", 20f)) : Number(r, "Roughness", 0.5f);
            var metalness = legacy ? 0f : Number(r, "Metalness", 0f);
            list.Add(new ColorRow(Vec3(r["Diffuse"]), Vec3(r["Emissive"]), Math.Clamp(roughness, 0.04f, 1f), Math.Clamp(metalness, 0f, 1f)));
        }
        return list;
    }

    /// <summary>Approximation de la rugosité à partir de la brillance des anciens shaders.</summary>
    private static float GlossToRoughness(float gloss) => MathF.Sqrt(2f / (Math.Max(gloss, 0f) + 2f));

    private static float Number(JsonObject o, string key, float fallback) =>
        o[key] is JsonValue v && v.TryGetValue<float>(out var f) && float.IsFinite(f) ? f : fallback;

    private static Vector3 Vec3(JsonNode? node)
    {
        if (node is not JsonObject o) return Vector3.One;
        return new Vector3(Number(o, "X", 1f), Number(o, "Y", 1f), Number(o, "Z", 1f));
    }
}

/// <summary>Table d'avant Dawntrail (16 lignes) : l'alpha de la normale choisit la ligne.</summary>
public sealed class LegacyColorTable
{
    public IReadOnlyList<ColorRow> Rows { get; }

    public LegacyColorTable(IReadOnlyList<ColorRow> rows) => Rows = rows;

    public static LegacyColorTable? Parse(JsonNode? node)
    {
        var rows = ColorTable.ReadRows(node, legacy: true);
        return rows is { Count: >= 2 } ? new LegacyColorTable(rows) : null;
    }

    /// <summary>Même calcul que le shader du jeu (lignes voisines mélangées près des bords).</summary>
    public ColorRow Sample(float index)
    {
        var last = Rows.Count - 1;
        var vBase = index * 15f;
        var vOffFilter = index * 7.5f % 1.0f;
        var smoothed = float.Lerp(vBase, MathF.Floor(vBase + 0.5f), vOffFilter * 2);
        var previous = Math.Clamp((int)MathF.Floor(smoothed), 0, last);
        var next = Math.Clamp((int)MathF.Ceiling(smoothed), 0, last);
        return ColorRow.Lerp(Rows[previous], Rows[next], smoothed % 1f);
    }
}
