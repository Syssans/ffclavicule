using System.Numerics;
using System.Text.Json.Nodes;

namespace Clavicule.Baking;

/// <summary>
/// Lecture des propriétés que Meddle range dans les « extras » d'un matériau glTF :
/// shader, clés de shader, constantes, chemins des textures en cache, couleurs du personnage.
/// </summary>
public sealed class MaterialData
{
    private readonly JsonObject props;
    private readonly string cacheDir;

    public MaterialData(JsonObject props, string cacheDir)
    {
        this.props = props;
        this.cacheDir = cacheDir;
    }

    public static MaterialData? From(JsonNode? extras, string cacheDir) =>
        extras is JsonObject obj && obj["ShaderPackage"] is not null ? new MaterialData(obj, cacheDir) : null;

    /// <summary>Nom du shader, ex. « skin.shpk ».</summary>
    public string Shader => String("ShaderPackage") ?? "";

    public bool IsTransparent => Bool("IsTransparent");
    public bool RenderBackfaces => Bool("RenderBackfaces");

    public JsonNode? this[string key] => props[key];

    public string? String(string key) => props[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    public bool Bool(string key) => props[key] is JsonValue v && v.TryGetValue<bool>(out var b) && b;

    /// <summary>Constante du shader (Meddle les écrit en tableau de flottants).</summary>
    public float Float(string key, float fallback)
    {
        return props[key] switch
        {
            JsonArray { Count: > 0 } a when a[0] is JsonValue v && v.TryGetValue<float>(out var f) => f,
            JsonValue v when v.TryGetValue<float>(out var f) => f,
            _ => fallback,
        };
    }

    public Vector3 Vec3(string key, Vector3 fallback)
    {
        var a = Floats(key);
        return a is { Length: >= 3 } ? new Vector3(a[0], a[1], a[2]) : fallback;
    }

    public Vector4 Vec4(string key, Vector4 fallback)
    {
        var a = Floats(key);
        return a switch
        {
            { Length: >= 4 } => new Vector4(a[0], a[1], a[2], a[3]),
            { Length: 3 } => new Vector4(a[0], a[1], a[2], fallback.W),
            _ => fallback,
        };
    }

    private float[]? Floats(string key)
    {
        if (props[key] is not JsonArray array) return null;
        var values = new float[array.Count];
        for (var i = 0; i < values.Length; i++)
        {
            if (array[i] is not JsonValue v || !v.TryGetValue<float>(out values[i])) return null;
        }
        return values;
    }

    /// <summary>Chemin du PNG mis en cache par Meddle pour un échantillonneur (ex. g_SamplerNormal), s'il existe.</summary>
    public string? TexturePath(string sampler)
    {
        var relative = String($"{sampler}_PngCachePath");
        if (relative == null) return null;
        var full = Path.GetFullPath(Path.Combine(cacheDir, relative));
        return File.Exists(full) ? full : null;
    }

    public Texture? LoadTexture(string sampler)
    {
        var path = TexturePath(sampler);
        return path == null ? null : Texture.Load(path);
    }
}
