using System.Numerics;

namespace Clavicule.Baking;

/// <summary>Triangle d'un maillage, vu par ses deux jeux de coordonnées de texture.</summary>
public readonly record struct UvTriangle(Vector2 A0, Vector2 B0, Vector2 C0, Vector2 A1, Vector2 B1, Vector2 C1);

/// <summary>Réglages de la peinture faciale, lus dans les paramètres du matériau.</summary>
public sealed record DecalSettings(Vector3 Color, float Strength, bool UseOwnColors, float UvMultiplier, float UvOffset)
{
    /// <summary>Lit la peinture faciale d'un matériau de visage ; null s'il n'en a pas.</summary>
    public static DecalSettings? From(MaterialData m)
    {
        var path = m.String("DecalPath");
        if (path == null || path.Contains("transparent", StringComparison.OrdinalIgnoreCase)) return null;
        var mode = m.String("GetDecalColor") ?? "GetDecalColorOff";
        var color = m.Vec4("DecalColor", new Vector4(0, 0, 0, 1));
        return new DecalSettings(
            new Vector3(color.X, color.Y, color.Z),
            mode == "GetDecalColorAlpha" ? Math.Clamp(color.W, 0f, 1f) : 1f,
            UseOwnColors: mode != "GetDecalColorAlpha",
            UvMultiplier: m.Float("FacePaintUVMultiplier", 1f),
            UvOffset: m.Float("FacePaintUVOffset", 0f));
    }
}

/// <summary>
/// Peinture faciale : le jeu la plaque avec le second jeu de coordonnées (UV1) du visage.
/// On la reporte dans la texture de couleur (UV0) en parcourant chaque triangle.
/// </summary>
public static class DecalBaker
{
    /// <summary>Masque de la peinture : canal alpha s'il sert, sinon le gris (textures à un seul canal).</summary>
    private static Func<int, float> MaskReader(Texture decal)
    {
        var usesAlpha = false;
        for (var i = 3; i < decal.Pixels.Length; i += 4)
        {
            if (decal.Pixels[i] < 250)
            {
                usesAlpha = true;
                break;
            }
        }
        return usesAlpha ? i => decal.Pixels[i + 3] / 255f : i => decal.Pixels[i] / 255f;
    }

    /// <summary>Valeur de la peinture (couleur linéaire, opacité) au point uv ; hors de l'image, rien.</summary>
    private static (Vector3 color, float alpha) Sample(Texture decal, Func<int, float> mask, DecalSettings s, Vector2 uv)
    {
        var u = uv.X * s.UvMultiplier + s.UvOffset;
        var v = uv.Y;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) return (Vector3.Zero, 0);
        // Interpolation bilinéaire.
        var fx = u * decal.Width - 0.5f;
        var fy = v * decal.Height - 0.5f;
        var x0 = (int)MathF.Floor(fx);
        var y0 = (int)MathF.Floor(fy);
        var tx = fx - x0;
        var ty = fy - y0;
        var color = Vector3.Zero;
        var alpha = 0f;
        for (var j = 0; j < 2; j++)
        for (var i = 0; i < 2; i++)
        {
            var x = Math.Clamp(x0 + i, 0, decal.Width - 1);
            var y = Math.Clamp(y0 + j, 0, decal.Height - 1);
            var w = (i == 0 ? 1 - tx : tx) * (j == 0 ? 1 - ty : ty);
            var index = (y * decal.Width + x) * 4;
            alpha += mask(index) * w;
            if (s.UseOwnColors)
            {
                var c = ColorSpace.ReadColor(decal, x, y);
                color += new Vector3(c.X, c.Y, c.Z) * w;
            }
        }
        return (s.UseOwnColors ? color : s.Color, alpha * s.Strength);
    }

    /// <summary>Peint la peinture faciale dans <paramref name="target"/> (texture de couleur, sRGB).</summary>
    public static int Apply(Texture target, IEnumerable<UvTriangle> triangles, Texture decal, DecalSettings settings)
    {
        var mask = MaskReader(decal);
        var w = target.Width;
        var h = target.Height;
        var painted = 0;
        // Un pixel partagé par deux triangles (bords) n'est peint qu'une fois.
        var done = new bool[w * h];
        foreach (var t in triangles)
        {
            // Triangle en pixels de la texture cible.
            var a = new Vector2(t.A0.X * w, t.A0.Y * h);
            var b = new Vector2(t.B0.X * w, t.B0.Y * h);
            var c = new Vector2(t.C0.X * w, t.C0.Y * h);
            var area = Cross(b - a, c - a);
            if (MathF.Abs(area) < 1e-6f) continue;
            var minX = Math.Max(0, (int)MathF.Floor(MathF.Min(a.X, MathF.Min(b.X, c.X))));
            var maxX = Math.Min(w - 1, (int)MathF.Ceiling(MathF.Max(a.X, MathF.Max(b.X, c.X))));
            var minY = Math.Max(0, (int)MathF.Floor(MathF.Min(a.Y, MathF.Min(b.Y, c.Y))));
            var maxY = Math.Min(h - 1, (int)MathF.Ceiling(MathF.Max(a.Y, MathF.Max(b.Y, c.Y))));
            for (var y = minY; y <= maxY; y++)
            for (var x = minX; x <= maxX; x++)
            {
                var p = new Vector2(x + 0.5f, y + 0.5f);
                var wa = Cross(b - p, c - p) / area;
                var wb = Cross(c - p, a - p) / area;
                var wc = 1 - wa - wb;
                // Un peu de marge sur les bords pour ne pas laisser de couture.
                if (wa < -0.02f || wb < -0.02f || wc < -0.02f || done[y * w + x]) continue;
                done[y * w + x] = true;
                var uv1 = t.A1 * wa + t.B1 * wb + t.C1 * wc;
                var (color, alpha) = Sample(decal, mask, settings, uv1);
                if (alpha <= 0.002f) continue;
                var baseColor = ColorSpace.ReadColor(target, x, y);
                var mixed = Vector3.Lerp(new Vector3(baseColor.X, baseColor.Y, baseColor.Z), color, Math.Clamp(alpha, 0f, 1f));
                ColorSpace.WriteColor(target, x, y, mixed, baseColor.W);
                painted++;
            }
        }
        return painted;
    }

    private static float Cross(Vector2 u, Vector2 v) => u.X * v.Y - u.Y * v.X;
}
