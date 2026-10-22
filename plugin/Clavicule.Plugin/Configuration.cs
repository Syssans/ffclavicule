using Clavicule.Sync;
using Dalamud.Configuration;

namespace Clavicule.Plugin;

[Serializable]
public sealed class Configuration : IPluginConfiguration
{
    /// <summary>
    /// Adresse du service Clavicule Sync (dossier server/), intégrée au plugin : rien à saisir.
    /// À renseigner une fois le service déployé.
    /// </summary>
    public const string DeployedServiceUrl = "";

    public int Version { get; set; } = 2;

    /// <summary>Facultatif (réglages avancés) : autre service que celui intégré.</summary>
    public string ServiceUrlOverride { get; set; } = "";

    public bool AutoUpload { get; set; } = true;
    public bool IncludeWeapons { get; set; } = true;
    public int MaxTextureSize { get; set; } = 1024;
    public bool Normals { get; set; } = true;

    /// <summary>État par personnage, indexé par « Nom@Monde ».</summary>
    public Dictionary<string, CharacterState> Characters { get; set; } = new();

    public string ServiceUrl => SyncClient.NormalizeUrl(ServiceUrlOverride.Length > 0 ? ServiceUrlOverride : DeployedServiceUrl);

    public bool IsReady => ServiceUrl.Length > 0;
}

[Serializable]
public sealed class CharacterState
{
    public string Name { get; set; } = "";
    public string World { get; set; } = "";
    /// <summary>Identifiant Lodestone (trouvé automatiquement, modifiable).</summary>
    public long? LodestoneId { get; set; }
    /// <summary>Secret qui prouve au service que ce PC est celui du personnage. Généré au premier envoi.</summary>
    public string Secret { get; set; } = "";
    /// <summary>Le service a lié ce personnage à un autre PC : confirmation Lodestone nécessaire.</summary>
    public bool NeedsLodestoneProof { get; set; }
    /// <summary>Code de confirmation en cours, à coller dans la présentation Lodestone.</summary>
    public string? ProofCode { get; set; }
    /// <summary>Empreinte de l'apparence au dernier envoi réussi.</summary>
    public string? LastHash { get; set; }
    public DateTime? LastUpload { get; set; }

    public string EnsureSecret()
    {
        if (Secret.Length == 0) Secret = SyncClient.NewSecret();
        return Secret;
    }
}
