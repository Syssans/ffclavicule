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
    public static BakeReport Apply(SceneBuilder scene, string cacheDir, BakeOptions options)
    {
        var materials = scene.Instances
            .Select(i => i.Content?.GetGeometryAsset())
            .OfType<IMeshBuilder<MaterialBuilder>>()
            .SelectMany(mesh => mesh.Primitives.Select(p => p.Material))
            .Where(mb => mb != null)
            .Distinct(ReferenceEqualityComparer.Instance)
            .Cast<MaterialBuilder>()
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
            try
            {
                var result = MaterialBaker.Bake(data, options);
                if (result == null)
                {
                    skipped++;
                }
                else
                {
                    ApplyTo(material, result);
                    baked++;
                }
            }
            catch (Exception e)
            {
                errors.Add($"{material.Name} ({data.Shader}) : {e.Message}");
            }
            // Les paramètres bruts (tables de couleurs, etc.) ne servent qu'à Blender : on allège le fichier.
            material.Extras = new JsonObject { ["shader"] = data.Shader };
        }
        return new BakeReport(baked, skipped, errors);
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
