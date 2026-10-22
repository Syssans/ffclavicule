using Dalamud.Configuration;

namespace Clavicule.Plugin;

[Serializable]
public sealed class Configuration : IPluginConfiguration
{
    public int Version { get; set; } = 1;

    /// <summary>Adresse du service de synchro du groupe.</summary>
    public string ServiceUrl { get; set; } = "";
    /// <summary>Clé d'écriture personnelle.</summary>
    public string WriteKey { get; set; } = "";

    public bool AutoUpload { get; set; } = true;
    public bool IncludeWeapons { get; set; } = true;
    public int MaxTextureSize { get; set; } = 1024;
    public bool Normals { get; set; } = true;

    /// <summary>État par personnage, indexé par « Nom@Monde ».</summary>
    public Dictionary<string, CharacterState> Characters { get; set; } = new();

    public bool IsReady => !string.IsNullOrWhiteSpace(ServiceUrl) && !string.IsNullOrWhiteSpace(WriteKey);
}

[Serializable]
public sealed class CharacterState
{
    public string Name { get; set; } = "";
    public string World { get; set; } = "";
    /// <summary>Identifiant Lodestone (trouvé automatiquement, modifiable).</summary>
    public long? LodestoneId { get; set; }
    /// <summary>Empreinte de l'apparence au dernier envoi réussi.</summary>
    public string? LastHash { get; set; }
    public DateTime? LastUpload { get; set; }
}
