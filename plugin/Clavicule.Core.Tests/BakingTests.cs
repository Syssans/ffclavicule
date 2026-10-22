using System.Numerics;
using System.Text.Json.Nodes;
using Clavicule.Baking;
using SharpGLTF.Geometry;
using SharpGLTF.Geometry.VertexTypes;
using SharpGLTF.Materials;
using SharpGLTF.Scenes;
using SharpGLTF.Schema2;
using Xunit;
using Texture = Clavicule.Baking.Texture;

namespace Clavicule.Core.Tests;

/// <summary>Cache de textures factice, rangé comme celui de Meddle (chemins relatifs dans les extras).</summary>
public sealed class FakeCache : IDisposable
{
    public string Dir { get; } = Directory.CreateTempSubdirectory("clavicule-bake-").FullName;

    public string Add(string name, int size, Func<int, int, (byte r, byte g, byte b, byte a)> pixel)
    {
        var t = new Texture(size, size);
        for (var y = 0; y < size; y++)
        for (var x = 0; x < size; x++)
        {
            var (r, g, b, a) = pixel(x, y);
            var i = (y * size + x) * 4;
            t.Pixels[i] = r; t.Pixels[i + 1] = g; t.Pixels[i + 2] = b; t.Pixels[i + 3] = a;
        }
        File.WriteAllBytes(Path.Combine(Dir, name), t.EncodePng());
        return name;
    }

    public void Dispose() => Directory.Delete(Dir, true);
}

public class BakingTests : IDisposable
{
    private readonly FakeCache cache = new();
    private static readonly BakeOptions Options = new();

    public void Dispose() => cache.Dispose();

    private static Vector3 Srgb(Texture t, int x, int y)
    {
        var i = (y * t.Width + x) * 4;
        return new Vector3(t.Pixels[i], t.Pixels[i + 1], t.Pixels[i + 2]);
    }

    private static Vector3 Expected(Vector3 linear) =>
        new(ColorSpace.LinearToByte(linear.X), ColorSpace.LinearToByte(linear.Y), ColorSpace.LinearToByte(linear.Z));

    private static JsonArray Arr(params float[] v) => new(v.Select(f => (JsonNode)JsonValue.Create(f)!).ToArray());

    [Fact]
    public void Peau_prend_la_couleur_du_personnage_et_le_rouge_a_levres()
    {
        // Moitié gauche : peau ; moitié droite : lèvres (alpha de la normale à 1).
        var normal = cache.Add("n.png", 8, (x, _) => (128, 128, 255, (byte)(x < 4 ? 0 : 255)));
        var diffuse = cache.Add("d.png", 8, (_, _) => (255, 255, 255, 255));
        var mask = cache.Add("m.png", 8, (_, _) => (128, 153, 0, 0));
        var skin = new Vector3(0.5f, 0.25f, 0.2f);
        var lips = new Vector3(0.6f, 0.05f, 0.1f);
        var data = new MaterialData(new JsonObject
        {
            ["ShaderPackage"] = "skin.shpk",
            ["GetMaterialValue"] = "GetMaterialValueFace",
            ["SkinColor"] = Arr(skin.X, skin.Y, skin.Z),
            ["LipColor"] = Arr(lips.X, lips.Y, lips.Z, 1f),
            ["LipStick"] = true,
            ["g_SamplerNormal_PngCachePath"] = normal,
            ["g_SamplerDiffuse_PngCachePath"] = diffuse,
            ["g_SamplerMask_PngCachePath"] = mask,
        }, cache.Dir);

        var baked = MaterialBaker.Bake(data, Options)!;
        Assert.Equal(Expected(skin), Srgb(baked.BaseColor, 1, 1));
        Assert.Equal(Expected(lips), Srgb(baked.BaseColor, 6, 1));
        Assert.NotNull(baked.Normal);
        Assert.Equal(BakedAlpha.Opaque, baked.Alpha);
    }

    [Fact]
    public void Equipement_suit_la_table_de_couleurs_teinte()
    {
        var rows = new JsonArray();
        for (var r = 0; r < 32; r++)
        {
            var c = r == 2 ? new Vector3(1, 0, 0) : r == 3 ? new Vector3(0, 0, 1) : new Vector3(0.5f);
            rows.Add(new JsonObject
            {
                ["Diffuse"] = new JsonObject { ["X"] = c.X, ["Y"] = c.Y, ["Z"] = c.Z },
                ["Emissive"] = new JsonObject { ["X"] = 0f, ["Y"] = 0f, ["Z"] = 0f },
                ["Roughness"] = 0.4f,
                ["Metalness"] = r == 2 ? 1f : 0f,
            });
        }
        var normal = cache.Add("n.png", 4, (_, _) => (128, 128, 255, 255));
        // Paire 1 (lignes 2 et 3) : vert à 255 -> ligne 2 (rouge), vert à 0 -> ligne 3 (bleu).
        var index = cache.Add("i.png", 4, (x, _) => (17, (byte)(x < 2 ? 255 : 0), 0, 255));
        var data = new MaterialData(new JsonObject
        {
            ["ShaderPackage"] = "character.shpk",
            ["GetValues"] = "GetValuesMultiMaterial",
            ["ColorTable"] = new JsonObject { ["ColorTable"] = new JsonObject { ["Rows"] = rows } },
            ["g_SamplerNormal_PngCachePath"] = normal,
            ["g_SamplerIndex_PngCachePath"] = index,
        }, cache.Dir);

        var baked = MaterialBaker.Bake(data, Options)!;
        Assert.Equal(new Vector3(255, 0, 0), Srgb(baked.BaseColor, 0, 0));
        Assert.Equal(new Vector3(0, 0, 255), Srgb(baked.BaseColor, 3, 0));
        // Métal : canal bleu de la texture métal/rugosité.
        Assert.Equal(255, baked.MetallicRoughness!.Pixels[2]);
        Assert.Equal(0, baked.MetallicRoughness.Pixels[3 * 4 + 2]);
    }

    [Fact]
    public void Ancienne_table_choisit_la_ligne_avec_l_alpha_de_la_normale()
    {
        var rows = Enumerable.Range(0, 16).Select(i => new ColorRow(new Vector3(i / 15f), Vector3.Zero, 0.5f, 0f)).ToList();
        var table = new LegacyColorTable(rows);
        Assert.Equal(0f, table.Sample(0f).Diffuse.X, 3);
        Assert.Equal(1f, table.Sample(1f).Diffuse.X, 3);
        Assert.Equal(5f / 15f, table.Sample(5f / 15f).Diffuse.X, 2);
    }

    [Fact]
    public void Cheveux_melangent_couleur_et_meches_et_gardent_la_transparence()
    {
        var normal = cache.Add("n.png", 4, (x, _) => (128, 128, (byte)(x < 2 ? 0 : 255), (byte)(x == 0 ? 0 : 255)));
        var mask = cache.Add("m.png", 4, (_, _) => (0, 128, 0, 255));
        var hair = new Vector3(0.3f, 0.1f, 0.02f);
        var highlight = new Vector3(0.8f, 0.8f, 0.8f);
        var data = new MaterialData(new JsonObject
        {
            ["ShaderPackage"] = "hair.shpk",
            ["GetSubColor"] = "GetSubColorHair",
            ["MainColor"] = Arr(hair.X, hair.Y, hair.Z),
            ["MeshColor"] = Arr(highlight.X, highlight.Y, highlight.Z),
            ["Highlights"] = true,
            ["g_AlphaThreshold"] = Arr(0.5f),
            ["g_SamplerNormal_PngCachePath"] = normal,
            ["g_SamplerMask_PngCachePath"] = mask,
        }, cache.Dir);

        var baked = MaterialBaker.Bake(data, Options)!;
        Assert.Equal(Expected(hair), Srgb(baked.BaseColor, 1, 0));
        Assert.Equal(Expected(highlight), Srgb(baked.BaseColor, 3, 0));
        Assert.Equal(0, baked.BaseColor.Pixels[3]);
        Assert.Equal(BakedAlpha.Mask, baked.Alpha);
        Assert.Equal(0.5f, baked.AlphaCutoff, 3);
    }

    [Fact]
    public void Yeux_colorent_l_iris_seulement()
    {
        var normal = cache.Add("n.png", 4, (_, _) => (128, 128, 255, 255));
        var diffuse = cache.Add("d.png", 4, (_, _) => (255, 255, 255, 255));
        var mask = cache.Add("m.png", 4, (x, _) => (0, 0, (byte)(x < 2 ? 255 : 0), 0));
        var iris = new Vector3(0.05f, 0.4f, 0.1f);
        var data = new MaterialData(new JsonObject
        {
            ["ShaderPackage"] = "iris.shpk",
            ["LeftIrisColor"] = Arr(iris.X, iris.Y, iris.Z, 1f),
            ["g_WhiteEyeColor"] = Arr(1f, 1f, 1f),
            ["g_SamplerNormal_PngCachePath"] = normal,
            ["g_SamplerDiffuse_PngCachePath"] = diffuse,
            ["g_SamplerMask_PngCachePath"] = mask,
        }, cache.Dir);

        var baked = MaterialBaker.Bake(data, Options)!;
        Assert.Equal(Expected(iris), Srgb(baked.BaseColor, 0, 0));
        Assert.Equal(new Vector3(255), Srgb(baked.BaseColor, 3, 0));
    }

    [Fact]
    public void Textures_reduites_a_la_taille_maximale()
    {
        var normal = cache.Add("n.png", 64, (_, _) => (128, 128, 255, 255));
        var diffuse = cache.Add("d.png", 32, (_, _) => (200, 100, 50, 255));
        var data = new MaterialData(new JsonObject
        {
            ["ShaderPackage"] = "characterlegacy.shpk",
            ["g_SamplerNormal_PngCachePath"] = normal,
            ["g_SamplerDiffuse_PngCachePath"] = diffuse,
        }, cache.Dir);
        var baked = MaterialBaker.Bake(data, Options with { MaxTextureSize = 16, Normals = false })!;
        Assert.Equal(16, baked.BaseColor.Width);
        Assert.Null(baked.Normal);
        // Sans table de couleurs, la texture de couleur passe telle quelle.
        Assert.Equal(new Vector3(200, 100, 50), Srgb(baked.BaseColor, 8, 8));
    }

    [Fact]
    public void Redimensionner_garde_les_canaux_des_pixels_transparents()
    {
        var t = new Texture(4, 4);
        for (var i = 0; i < t.Pixels.Length; i += 4)
        {
            t.Pixels[i] = 10; t.Pixels[i + 1] = 200; t.Pixels[i + 2] = 255; t.Pixels[i + 3] = 0;
        }
        var small = t.Resize(2, 2);
        Assert.Equal(new byte[] { 10, 200, 255, 0 }, small.Pixels[..4]);
        var big = t.Resize(8, 8);
        Assert.Equal(new byte[] { 10, 200, 255, 0 }, big.Pixels[^4..]);
        var roundTrip = Texture.Decode(t.EncodePng());
        Assert.Equal(t.Pixels, roundTrip.Pixels);
    }

    [Fact]
    public void Occlusion_devient_invisible_et_texture_manquante_ne_plante_pas()
    {
        var occlusion = MaterialBaker.Bake(new MaterialData(new JsonObject { ["ShaderPackage"] = "characterocclusion.shpk" }, cache.Dir), Options)!;
        Assert.Equal(BakedAlpha.Blend, occlusion.Alpha);
        Assert.Equal(0, occlusion.BaseColor.Pixels[3]);

        var missing = MaterialBaker.Bake(new MaterialData(new JsonObject
        {
            ["ShaderPackage"] = "skin.shpk",
            ["g_SamplerNormal_PngCachePath"] = "absent.png",
        }, cache.Dir), Options);
        Assert.Null(missing);
    }

    [Fact]
    public void Scene_complete_donne_un_glb_texture_sans_parametres_bruts()
    {
        var normal = cache.Add("n.png", 4, (_, _) => (128, 128, 255, 255));
        var diffuse = cache.Add("d.png", 4, (_, _) => (255, 255, 255, 255));
        var material = new MaterialBuilder("peau")
        {
            Extras = new JsonObject
            {
                ["ShaderPackage"] = "skin.shpk",
                ["SkinColor"] = Arr(0.5f, 0.3f, 0.2f),
                ["ColorTable"] = new JsonObject { ["énorme"] = true },
                ["g_SamplerNormal_PngCachePath"] = normal,
                ["g_SamplerDiffuse_PngCachePath"] = diffuse,
            },
        };
        var plain = new MaterialBuilder("sans_meddle");
        var mesh = new MeshBuilder<VertexPositionNormal, VertexTexture1>("triangle");
        var a = new VertexBuilder<VertexPositionNormal, VertexTexture1, VertexEmpty>(new VertexPositionNormal(0, 0, 0, 0, 0, 1), new VertexTexture1(new Vector2(0, 0)));
        var b = new VertexBuilder<VertexPositionNormal, VertexTexture1, VertexEmpty>(new VertexPositionNormal(1, 0, 0, 0, 0, 1), new VertexTexture1(new Vector2(1, 0)));
        var c = new VertexBuilder<VertexPositionNormal, VertexTexture1, VertexEmpty>(new VertexPositionNormal(0, 1, 0, 0, 0, 1), new VertexTexture1(new Vector2(0, 1)));
        mesh.UsePrimitive(material).AddTriangle(a, b, c);
        mesh.UsePrimitive(plain).AddTriangle(a, c, b);
        var scene = new SceneBuilder();
        scene.AddRigidMesh(mesh, Matrix4x4.Identity);

        var diagnostics = new BakeDiagnostics();
        var report = SceneBaker.Apply(scene, cache.Dir, Options, diagnostics);
        Assert.Equal(1, report.Baked);
        Assert.Equal(1, report.Skipped);
        Assert.Empty(report.Errors);

        var bytes = scene.ToGltf2().WriteGLB().ToArray();
        Assert.Equal("glTF"u8.ToArray(), bytes[..4]);
        var model = ModelRoot.ParseGLB(bytes);
        var baked = model.LogicalMaterials.Single(m => m.Name == "peau");
        Assert.NotNull(baked.FindChannel("BaseColor")?.Texture);
        Assert.NotNull(baked.FindChannel("Normal")?.Texture);
        Assert.Null(baked.Extras?["ColorTable"]);

        // Le diagnostic garde les paramètres bruts, les textures d'origine et la couleur cuite.
        using var zip = new System.IO.Compression.ZipArchive(new MemoryStream(diagnostics.ToZip()));
        var names = zip.Entries.Select(e => e.FullName).ToList();
        Assert.Contains("materials.json", names);
        Assert.Contains("sources/peau/g_SamplerNormal.png", names);
        Assert.Contains("baked/peau_color.png", names);
        using var reader = new StreamReader(zip.GetEntry("materials.json")!.Open());
        var index = System.Text.Json.Nodes.JsonNode.Parse(reader.ReadToEnd())!;
        Assert.True(index["materials"]![0]!["extras"]!["ColorTable"]!["énorme"]!.GetValue<bool>());
    }
}
