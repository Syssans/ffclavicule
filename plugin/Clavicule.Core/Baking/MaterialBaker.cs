using System.Numerics;

namespace Clavicule.Baking;

public enum BakedAlpha { Opaque, Mask, Blend }

/// <summary>Matériau glTF standard (métal/rugosité) obtenu à partir d'un matériau du jeu.</summary>
public sealed record BakedMaterial(
    Texture BaseColor,
    Texture? Normal,
    Texture? MetallicRoughness,
    BakedAlpha Alpha,
    float AlphaCutoff,
    bool DoubleSided);

public sealed record BakeOptions
{
    /// <summary>Plus grand côté des textures produites (limite le poids du fichier).</summary>
    public int MaxTextureSize { get; init; } = 1024;
    /// <summary>Produire les cartes de normales (relief), un peu plus lourdes.</summary>
    public bool Normals { get; init; } = true;
}

/// <summary>
/// Reproduit, de façon simplifiée, le calcul des couleurs des shaders de personnage du jeu
/// (peau, cheveux, yeux, équipement teint) pour obtenir des textures lisibles par n'importe quel visualiseur glTF.
/// D'après les anciens « material builders » de Meddle (AGPL-3.0).
/// </summary>
public static class MaterialBaker
{
    private const string Normal = "g_SamplerNormal";
    private const string Mask = "g_SamplerMask";
    private const string Diffuse = "g_SamplerDiffuse";
    private const string Index = "g_SamplerIndex";

    public static BakedMaterial? Bake(MaterialData m, BakeOptions options)
    {
        var shader = m.Shader;
        return shader switch
        {
            "skin.shpk" => Skin(m, options),
            "hair.shpk" => Hair(m, options),
            "iris.shpk" => Iris(m, options),
            "charactertattoo.shpk" => Tattoo(m, options),
            "characterocclusion.shpk" => Invisible(),
            _ when shader.StartsWith("character", StringComparison.Ordinal) => Character(m, options),
            _ => Generic(m, options),
        };
    }

    // ---------------------------------------------------------------- textures communes

    /// <summary>Charge la normale (référence de taille) puis les autres textures à la même taille.</summary>
    private static (Texture normal, Texture?[] others)? LoadSet(MaterialData m, BakeOptions options, params string[] samplers)
    {
        var normal = m.LoadTexture(Normal)?.Limit(options.MaxTextureSize);
        if (normal == null) return null;
        var others = samplers.Select(s => m.LoadTexture(s)?.Resize(normal.Width, normal.Height)).ToArray();
        return (normal, others);
    }

    /// <summary>Normale tangente reconstruite à partir des canaux rouge et vert (le bleu et l'alpha servent à autre chose).</summary>
    private static Vector4 TangentNormal(Vector4 raw)
    {
        var nx = raw.X * 2f - 1f;
        var ny = raw.Y * 2f - 1f;
        var nz = MathF.Sqrt(Math.Max(0f, 1f - nx * nx - ny * ny));
        return new Vector4(nx * 0.5f + 0.5f, ny * 0.5f + 0.5f, nz * 0.5f + 0.5f, 1f);
    }

    private static (BakedAlpha mode, float cutoff) AlphaMode(MaterialData m, float defaultThreshold = 0f)
    {
        var threshold = m.Float("g_AlphaThreshold", defaultThreshold);
        if (m.IsTransparent) return (BakedAlpha.Blend, 0.5f);
        return threshold > 0f ? (BakedAlpha.Mask, Math.Clamp(threshold, 0.01f, 0.99f)) : (BakedAlpha.Opaque, 0.5f);
    }

    // ---------------------------------------------------------------- peau

    private static BakedMaterial? Skin(MaterialData m, BakeOptions options)
    {
        var set = LoadSet(m, options, Mask, Diffuse);
        if (set == null) return Generic(m, options);
        var (normal, others) = set.Value;
        var mask = others[0];
        var diffuse = others[1];

        var part = m.String("GetMaterialValue") ?? "GetMaterialValueFace";
        var isFace = part.StartsWith("GetMaterialValueFace", StringComparison.Ordinal);
        var isHrothgar = part == "GetMaterialValueBodyJJM";
        var skinColor = m.Vec3("SkinColor", new Vector3(0.6f, 0.45f, 0.38f));
        var lipColor = m.Vec4("LipColor", Vector4.Zero);
        var hairColor = m.Vec3("MainColor", new Vector3(0.1f));
        var highlight = m.Bool("Highlights") ? m.Vec3("MeshColor", hairColor) : hairColor;
        var baseTint = m.Vec3("g_DiffuseColor", Vector3.One);
        var lipstick = m.Bool("LipStick");
        var lipRoughness = m.Float("g_LipRoughnessScale", 0.7f);

        var w = normal.Width;
        var h = normal.Height;
        var color = new Texture(w, h);
        var outNormal = options.Normals ? new Texture(w, h) : null;
        var mr = new Texture(w, h);
        Texture.ForEach(w, h, (x, y) =>
        {
            var n = ColorSpace.ReadData(normal, x, y);
            var d = diffuse != null ? ColorSpace.ReadColor(diffuse, x, y) : Vector4.One;
            var k = mask != null ? ColorSpace.ReadData(mask, x, y) : new Vector4(0.5f, 0.6f, 0f, 0f);

            // Bleu de la normale : part de la couleur de peau choisie à la création du personnage.
            var rgb = new Vector3(d.X, d.Y, d.Z) * Vector3.Lerp(baseTint, skinColor, n.Z);
            var roughness = k.Y;
            var alpha = d.W;

            if (isHrothgar)
            {
                // Pelage : couleur des cheveux (avec mèches), assombrie comme dans le jeu.
                var fur = Vector3.Lerp(hairColor, highlight, k.W) * 0.4f;
                rgb = Vector3.Lerp(rgb, fur, Math.Clamp(n.W - n.Z, 0f, 1f));
                alpha = 1f;
            }
            else if (isFace && lipstick)
            {
                // Alpha de la normale : zone des lèvres.
                rgb = Vector3.Lerp(rgb, new Vector3(lipColor.X, lipColor.Y, lipColor.Z), n.W * lipColor.W);
            }
            if (isFace) roughness *= float.Lerp(1f, lipRoughness, n.W);

            ColorSpace.WriteColor(color, x, y, rgb, alpha);
            if (outNormal != null) ColorSpace.WriteData(outNormal, x, y, TangentNormal(n));
            ColorSpace.WriteData(mr, x, y, new Vector4(1f, Math.Clamp(roughness, 0.3f, 1f), 0f, 1f));
        });

        var (mode, cutoff) = AlphaMode(m);
        return new BakedMaterial(color, outNormal, mr, mode, cutoff, m.RenderBackfaces);
    }

    // ---------------------------------------------------------------- cheveux, poils du visage, écailles

    private static BakedMaterial? Hair(MaterialData m, BakeOptions options)
    {
        var set = LoadSet(m, options, Mask);
        if (set == null) return Generic(m, options);
        var (normal, others) = set.Value;
        var mask = others[0];

        var hairColor = m.Vec3("MainColor", new Vector3(0.1f));
        var isFace = m.String("GetSubColor") == "GetSubColorFace";
        // Couleur secondaire : mèches pour les cheveux, couleur des marques raciales pour le visage.
        var bonus = isFace ? m.Vec3("OptionColor", hairColor) : m.Bool("Highlights") ? m.Vec3("MeshColor", hairColor) : hairColor;

        var w = normal.Width;
        var h = normal.Height;
        var color = new Texture(w, h);
        var outNormal = options.Normals ? new Texture(w, h) : null;
        var mr = new Texture(w, h);
        Texture.ForEach(w, h, (x, y) =>
        {
            var n = ColorSpace.ReadData(normal, x, y);
            var k = mask != null ? ColorSpace.ReadData(mask, x, y) : new Vector4(0.5f, 0.5f, 0f, 1f);
            var rgb = Vector3.Lerp(hairColor, bonus, n.Z);
            // Alpha du masque : ombrage interne de la mèche, adouci pour ne pas tout noircir.
            rgb *= float.Lerp(0.55f, 1f, k.W);
            ColorSpace.WriteColor(color, x, y, rgb, n.W);
            if (outNormal != null) ColorSpace.WriteData(outNormal, x, y, TangentNormal(n));
            ColorSpace.WriteData(mr, x, y, new Vector4(1f, Math.Clamp(k.Y, 0.35f, 1f), 0f, 1f));
        });

        var (_, cutoff) = AlphaMode(m, 0.5f);
        var threshold = m.Float("g_AlphaThreshold", 0.5f);
        return new BakedMaterial(color, outNormal, mr, BakedAlpha.Mask, threshold > 0 ? Math.Clamp(threshold, 0.01f, 0.99f) : cutoff, true);
    }

    // ---------------------------------------------------------------- yeux

    private static BakedMaterial? Iris(MaterialData m, BakeOptions options)
    {
        var set = LoadSet(m, options, Mask, Diffuse);
        if (set == null) return Generic(m, options);
        var (normal, others) = set.Value;
        var mask = others[0];
        var diffuse = others[1];

        var whites = m.Vec3("g_WhiteEyeColor", Vector3.One);
        var iris = m.Vec4("LeftIrisColor", new Vector4(0.3f, 0.3f, 0.5f, 1f));
        var irisColor = new Vector3(iris.X, iris.Y, iris.Z);

        var w = normal.Width;
        var h = normal.Height;
        var color = new Texture(w, h);
        var outNormal = options.Normals ? new Texture(w, h) : null;
        var mr = new Texture(w, h);
        Texture.ForEach(w, h, (x, y) =>
        {
            var n = ColorSpace.ReadData(normal, x, y);
            var d = diffuse != null ? ColorSpace.ReadColor(diffuse, x, y) : Vector4.One;
            var k = mask != null ? ColorSpace.ReadData(mask, x, y) : Vector4.Zero;
            var baseRgb = new Vector3(d.X, d.Y, d.Z);
            // Bleu du masque : iris (couleur choisie) ; ailleurs, blanc de l'œil.
            var rgb = Vector3.Lerp(baseRgb * whites, baseRgb * irisColor, k.Z);
            ColorSpace.WriteColor(color, x, y, rgb, 1f);
            if (outNormal != null) ColorSpace.WriteData(outNormal, x, y, TangentNormal(n));
            ColorSpace.WriteData(mr, x, y, new Vector4(1f, 0.15f, 0f, 1f));
        });
        return new BakedMaterial(color, outNormal, mr, BakedAlpha.Opaque, 0.5f, m.RenderBackfaces);
    }

    // ---------------------------------------------------------------- tatouages, marques faciales

    private static BakedMaterial? Tattoo(MaterialData m, BakeOptions options)
    {
        var normal = m.LoadTexture(Normal)?.Limit(options.MaxTextureSize);
        if (normal == null) return Invisible();
        var tint = m.Vec3("OptionColor", new Vector3(0.2f));
        var color = new Texture(normal.Width, normal.Height);
        Texture.ForEach(normal.Width, normal.Height, (x, y) =>
        {
            var n = ColorSpace.ReadData(normal, x, y);
            ColorSpace.WriteColor(color, x, y, n.Z > 0 ? tint : Vector3.Zero, n.W);
        });
        return new BakedMaterial(color, null, null, BakedAlpha.Blend, 0.5f, true);
    }

    // ---------------------------------------------------------------- équipement et corps

    private static BakedMaterial? Character(MaterialData m, BakeOptions options)
    {
        var set = LoadSet(m, options, Mask, Diffuse, Index);
        if (set == null) return Generic(m, options);
        var (normal, others) = set.Value;
        var diffuse = others[1];
        var index = others[2];

        var table = ColorTable.Parse(m["ColorTable"]);
        var legacy = table == null ? LegacyColorTable.Parse(m["LegacyColorTable"]) : null;
        // « Compatibility » : la texture de couleur est multipliée par la table ; sinon la table seule colore.
        var useDiffuse = diffuse != null && (m.String("GetValues") != "GetValuesMultiMaterial" || table == null);
        var baseTint = m.Vec3("g_DiffuseColor", Vector3.One);

        var w = normal.Width;
        var h = normal.Height;
        var color = new Texture(w, h);
        var outNormal = options.Normals ? new Texture(w, h) : null;
        var mr = new Texture(w, h);
        Texture.ForEach(w, h, (x, y) =>
        {
            var n = ColorSpace.ReadData(normal, x, y);
            var row = new ColorRow(baseTint, Vector3.Zero, 0.6f, 0f);
            if (table != null && index != null)
            {
                var i = (y * w + x) * 4;
                row = table.Sample(index.Pixels[i], index.Pixels[i + 1]);
            }
            else if (legacy != null)
            {
                row = legacy.Sample(n.W);
            }

            var rgb = row.Diffuse;
            if (useDiffuse)
            {
                var d = ColorSpace.ReadColor(diffuse!, x, y);
                rgb *= new Vector3(d.X, d.Y, d.Z);
            }
            // Bleu de la normale : opacité.
            ColorSpace.WriteColor(color, x, y, rgb + row.Emissive * 0.25f, n.Z);
            if (outNormal != null) ColorSpace.WriteData(outNormal, x, y, TangentNormal(n));
            ColorSpace.WriteData(mr, x, y, new Vector4(1f, row.Roughness, row.Metalness, 1f));
        });

        var (mode, cutoff) = m.Shader == "characterglass.shpk" ? (BakedAlpha.Blend, 0.5f) : AlphaMode(m);
        if (mode == BakedAlpha.Opaque && color.HasTransparency()) (mode, cutoff) = (BakedAlpha.Mask, 0.5f);
        return new BakedMaterial(color, outNormal, mr, mode, cutoff, m.RenderBackfaces);
    }

    // ---------------------------------------------------------------- autres

    private static BakedMaterial? Generic(MaterialData m, BakeOptions options)
    {
        var diffuse = m.LoadTexture(Diffuse)?.Limit(options.MaxTextureSize);
        if (diffuse == null) return null;
        var (mode, cutoff) = AlphaMode(m);
        return new BakedMaterial(diffuse, null, null, mode, cutoff, m.RenderBackfaces);
    }

    private static BakedMaterial Invisible()
    {
        var color = new Texture(1, 1, [0, 0, 0, 0]);
        return new BakedMaterial(color, null, null, BakedAlpha.Blend, 0.5f, false);
    }
}
