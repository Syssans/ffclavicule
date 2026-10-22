using System.Numerics;
using System.Text.Json.Nodes;
using SharpGLTF.Geometry;
using SharpGLTF.Materials;
using SharpGLTF.Memory;
using SharpGLTF.Scenes;

namespace Clavicule.Baking;

public sealed record BakeReport(int Baked, int Skipped, IReadOnlyList<string> Errors);

/// <summary>Remplace les matériaux « bruts » de Meddle par des matériaux glTF texturés.</summary>
public static class SceneBaker
{
    public static BakeReport Apply(SceneBuilder scene, string cacheDir, BakeOptions options, BakeDiagnostics? diagnostics = null)
    {
        var materials = scene.Instances
            .Select(i => i.Content?.GetGeometryAsset())
            .OfType<IMeshBuilder<MaterialBuilder>>()
            .SelectMany(mesh => mesh.Primitives.Select(p => p.Material))
            .Where(mb => mb != null)
            .Distinct(ReferenceEqualityComparer.Instance)
            .Cast<MaterialBuilder>()
            .ToList();

        var meshes = scene.Instances
            .Select(i => i.Content?.GetGeometryAsset())
            .OfType<IMeshBuilder<MaterialBuilder>>()
            .Distinct(ReferenceEqualityComparer.Instance)
            .Cast<IMeshBuilder<MaterialBuilder>>()
            .ToList();

        int baked = 0, skipped = 0;
        var errors = new List<string>();
        foreach (var material in materials)
        {
            var data = MaterialData.From(material.Extras, cacheDir);
            if (data == null)
            {
                skipped++;
                continue;
            }
            BakedMaterial? result = null;
            string? failure = null;
            try
            {
                result = MaterialBaker.Bake(data, options);
                if (result == null)
                {
                    skipped++;
                }
                else
                {
                    PaintDecal(data, result, material, meshes, options);
                    ApplyTo(material, result);
                    baked++;
                }
            }
            catch (Exception e)
            {
                failure = e.Message;
                errors.Add($"{material.Name} ({data.Shader}) : {e.Message}");
            }
            diagnostics?.Record(material.Name, data, material.Extras, result, failure);
            // Les paramètres bruts (tables de couleurs, etc.) ne servent qu'à Blender : on allège le fichier.
            material.Extras = new JsonObject { ["shader"] = data.Shader };
        }
        return new BakeReport(baked, skipped, errors);
    }

    /// <summary>Peinture faciale : reportée dans la couleur du visage à l'aide des deux jeux d'UV du maillage.</summary>
    private static void PaintDecal(MaterialData data, BakedMaterial result, MaterialBuilder material,
                                   IReadOnlyList<IMeshBuilder<MaterialBuilder>> meshes, BakeOptions options)
    {
        if (data.Shader != "skin.shpk") return;
        var settings = DecalSettings.From(data);
        var decal = settings == null ? null : data.LoadTexture("Decal");
        if (settings == null || decal == null) return;
        DecalBaker.Apply(result.BaseColor, TrianglesOf(material, meshes), decal, settings);
    }

    /// <summary>Triangles (UV0 et UV1) de toutes les parties de maillage qui utilisent ce matériau.</summary>
    public static IEnumerable<UvTriangle> TrianglesOf(MaterialBuilder material, IEnumerable<IMeshBuilder<MaterialBuilder>> meshes)
    {
        foreach (var mesh in meshes)
        foreach (var primitive in mesh.Primitives)
        {
            if (!ReferenceEquals(primitive.Material, material)) continue;
            var vertices = primitive.Vertices;
            if (vertices.Count == 0 || vertices[0].GetMaterial().MaxTextCoords < 2) continue;
            foreach (var (a, b, c) in primitive.Triangles)
            {
                var ma = vertices[a].GetMaterial();
                var mb = vertices[b].GetMaterial();
                var mc = vertices[c].GetMaterial();
                yield return new UvTriangle(ma.GetTexCoord(0), mb.GetTexCoord(0), mc.GetTexCoord(0),
                                            ma.GetTexCoord(1), mb.GetTexCoord(1), mc.GetTexCoord(1));
            }
        }
    }

    public static void ApplyTo(MaterialBuilder material, BakedMaterial baked)
    {
        material.WithMetallicRoughnessShader();
        var transparent = baked.Alpha != BakedAlpha.Opaque;
        var colorBytes = transparent ? baked.BaseColor.EncodePng() : baked.BaseColor.EncodeJpeg(90);
        material.WithBaseColor(ImageBuilder.From(new MemoryImage(colorBytes), $"{material.Name}_color"), Vector4.One);
        if (baked.Normal != null)
        {
            material.WithNormal(ImageBuilder.From(new MemoryImage(baked.Normal.EncodeJpeg(90)), $"{material.Name}_normal"), 1f);
        }
        if (baked.MetallicRoughness != null)
        {
            material.WithMetallicRoughness(ImageBuilder.From(new MemoryImage(baked.MetallicRoughness.EncodeJpeg(85)), $"{material.Name}_mr"), 1f, 1f);
        }
        else
        {
            material.WithMetallicRoughness(0f, 0.7f);
        }
        material.WithAlpha(baked.Alpha switch
        {
            BakedAlpha.Mask => AlphaMode.MASK,
            BakedAlpha.Blend => AlphaMode.BLEND,
            _ => AlphaMode.OPAQUE,
        }, baked.AlphaCutoff);
        material.WithDoubleSide(baked.DoubleSided);
    }
}
