using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Clavicule.Baking;

/// <summary>
/// Dossier de diagnostic des couleurs : paramètres bruts de chaque matériau, textures d'origine
/// et résultat cuit, en petit format. Sert à corriger la cuisson à partir de vraies données du jeu.
/// </summary>
public sealed class BakeDiagnostics
{
    private const int PreviewSize = 256;
    private readonly List<JsonObject> materials = [];
    private readonly Dictionary<string, byte[]> files = [];

    /// <summary>Note un matériau avant cuisson (les « extras » sont ensuite allégés).</summary>
    public void Record(string materialName, MaterialData data, JsonNode? extras, BakedMaterial? baked, string? error)
    {
        var entry = new JsonObject
        {
            ["name"] = materialName,
            ["shader"] = data.Shader,
            ["baked"] = baked != null,
            ["error"] = error,
            ["extras"] = extras?.DeepClone(),
        };
        var textures = new JsonObject();
        if (extras is JsonObject props)
        {
            foreach (var (key, value) in props)
            {
                if (!key.EndsWith("_PngCachePath", StringComparison.Ordinal)) continue;
                var sampler = key[..^"_PngCachePath".Length];
                var path = data.TexturePath(sampler);
                if (path == null) continue;
                var name = $"sources/{Safe(materialName)}/{sampler}.png";
                try
                {
                    files[name] = Texture.Load(path).Limit(PreviewSize).EncodePng();
                    textures[sampler] = name;
                }
                catch (Exception e)
                {
                    textures[sampler] = $"illisible : {e.Message}";
                }
            }
        }
        entry["textures"] = textures;
        if (baked != null)
        {
            var name = $"baked/{Safe(materialName)}_color.png";
            files[name] = baked.BaseColor.Limit(PreviewSize).EncodePng();
            entry["bakedColor"] = name;
        }
        lock (materials) materials.Add(entry);
    }

    public byte[] ToZip(JsonObject? summary = null)
    {
        using var stream = new MemoryStream();
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var index = new JsonObject { ["summary"] = summary, ["materials"] = new JsonArray(materials.Select(m => (JsonNode)m).ToArray()) };
            Write(zip, "materials.json", JsonSerializer.SerializeToUtf8Bytes(index, new JsonSerializerOptions { WriteIndented = true }));
            foreach (var (name, bytes) in files) Write(zip, name, bytes);
        }
        return stream.ToArray();
    }

    private static void Write(ZipArchive zip, string name, byte[] bytes)
    {
        var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
        using var output = entry.Open();
        output.Write(bytes);
    }

    private static string Safe(string name) =>
        string.Concat(name.Select(c => char.IsLetterOrDigit(c) || c is '_' or '-' or '.' ? c : '_'));
}
