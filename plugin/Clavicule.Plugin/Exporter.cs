using Clavicule.Baking;
using Clavicule.Sync;
using Dalamud.Game.ClientState.Objects.SubKinds;
using Dalamud.Interface.ImGuiNotification;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;
using FFXIVClientStructs.FFXIV.Client.Game.Character;

namespace Clavicule.Plugin;

/// <summary>
/// Surveille l'apparence du personnage joué et envoie son modèle 3D quand elle change
/// (et qu'elle est stable depuis quelques secondes, personnage au repos).
/// </summary>
public sealed class Exporter : IDisposable
{
    private static readonly TimeSpan CheckEvery = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan StableFor = TimeSpan.FromSeconds(6);
    private static readonly TimeSpan RetryAfter = TimeSpan.FromMinutes(10);

    private readonly IDalamudPluginInterface pluginInterface;
    private readonly Configuration config;
    private readonly IFramework framework;
    private readonly IObjectTable objects;
    private readonly ICondition condition;
    private readonly IClientState clientState;
    private readonly INotificationManager notifications;
    private readonly IPluginLog log;
    private readonly MeddleBridge meddle;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromMinutes(3) };
    private readonly SyncClient sync;
    private readonly CancellationTokenSource disposing = new();

    private DateTime nextCheck = DateTime.MinValue;
    private string? pendingHash;
    private DateTime pendingSince;
    private DateTime failedAt = DateTime.MinValue;
    private string? failedHash;
    private volatile bool busy;

    public string Status { get; private set; } = "En attente.";
    public bool Busy => busy;

    public Exporter(IDalamudPluginInterface pluginInterface, Configuration config, IFramework framework, IObjectTable objects,
                    ICondition condition, IClientState clientState, INotificationManager notifications, IPluginLog log, MeddleBridge meddle)
    {
        this.pluginInterface = pluginInterface;
        this.config = config;
        this.framework = framework;
        this.objects = objects;
        this.condition = condition;
        this.clientState = clientState;
        this.notifications = notifications;
        this.log = log;
        this.meddle = meddle;
        sync = new SyncClient(http);
        framework.Update += OnUpdate;
    }

    public (string key, CharacterState state)? CurrentCharacter()
    {
        if (objects.LocalPlayer is not IPlayerCharacter player) return null;
        var name = player.Name.TextValue;
        var world = player.HomeWorld.Value.Name.ToString();
        var key = $"{name}@{world}";
        if (!config.Characters.TryGetValue(key, out var state))
        {
            state = new CharacterState { Name = name, World = world };
            config.Characters[key] = state;
        }
        return (key, state);
    }

    private unsafe void OnUpdate(IFramework _)
    {
        if (busy || !config.AutoUpload || !config.IsReady || DateTime.UtcNow < nextCheck) return;
        nextCheck = DateTime.UtcNow + CheckEvery;
        if (objects.LocalPlayer is not IPlayerCharacter player) return;
        var character = (Character*)player.Address;
        if (character->DrawObject == null) return;

        var current = CurrentCharacter();
        if (current == null || current.Value.state.NeedsLodestoneProof) return;
        var hash = Appearance.Hash(character, config.IncludeWeapons);
        if (hash == current.Value.state.LastHash)
        {
            pendingHash = null;
            return;
        }
        // Après un échec, on ne réessaie la même apparence qu'au bout de quelques minutes.
        if (hash == failedHash && DateTime.UtcNow - failedAt < RetryAfter) return;
        if (hash != pendingHash)
        {
            pendingHash = hash;
            pendingSince = DateTime.UtcNow;
            return;
        }
        if (DateTime.UtcNow - pendingSince < StableFor) return;
        if (!Appearance.IsIdle(character, condition, clientState)) return;
        Start(character, current.Value.state, hash, manual: false, diagnostics: false);
    }

    /// <summary>Envoi demandé depuis la fenêtre ou la commande.</summary>
    public unsafe void SendNow(bool diagnostics = false)
    {
        framework.RunOnFrameworkThread(() =>
        {
            if (busy) return;
            if (!config.IsReady)
            {
                Status = "Aucun service de synchro n’est configuré dans cette version du plugin.";
                return;
            }
            if (objects.LocalPlayer is not IPlayerCharacter player)
            {
                Status = "Aucun personnage connecté.";
                return;
            }
            var character = (Character*)player.Address;
            var current = CurrentCharacter();
            if (current == null || character->DrawObject == null) return;
            Start(character, current.Value.state, Appearance.Hash(character, config.IncludeWeapons), manual: true, diagnostics);
        });
    }

    private unsafe void Start(Character* character, CharacterState state, string hash, bool manual, bool diagnostics)
    {
        busy = true;
        pendingHash = null;
        Status = "Lecture du personnage…";
        Meddle.Plugin.Models.Layout.ParsedCharacterInfo? info;
        try
        {
            info = meddle.Capture(character, config.IncludeWeapons);
        }
        catch (Exception e)
        {
            Fail(hash, $"Lecture du personnage impossible : {e.Message}", e, manual);
            return;
        }
        if (info == null)
        {
            Fail(hash, "Le modèle du personnage n’est pas encore chargé.", null, manual);
            return;
        }

        Upload(info, state, hash, manual, diagnostics);
    }

    private void Upload(Meddle.Plugin.Models.Layout.ParsedCharacterInfo info, CharacterState state, string hash, bool manual, bool diagnostics)
    {
        var options = new BakeOptions { MaxTextureSize = config.MaxTextureSize, Normals = config.Normals };
        var serviceUrl = config.ServiceUrl;
        var secret = state.EnsureSecret();
        var token = disposing.Token;
        Task.Run(async () =>
        {
            Status = "Création du modèle 3D…";
            var bakeDiagnostics = diagnostics ? new BakeDiagnostics() : null;
            var built = meddle.Build(info, state.Name, options, bakeDiagnostics, token);
            foreach (var error in built.Report.Errors) log.Warning($"Matériau non cuit : {error}");

            var lodestoneId = state.LodestoneId;
            if (lodestoneId == null)
            {
                Status = "Recherche du personnage sur le Lodestone…";
                lodestoneId = await LodestoneSearch.FindAsync(http, state.Name, state.World, token);
                if (lodestoneId == null)
                    throw new UserFacingException("Personnage introuvable sur le Lodestone : renseigne son identifiant dans /clavicule.");
                state.LodestoneId = lodestoneId;
            }

            Status = $"Envoi du modèle ({built.Glb.Length / 1024 / 1024.0:0.0} Mo)…";
            var result = await sync.UploadAsync(serviceUrl, secret, lodestoneId.Value, built.Glb, state.Name, state.World, hash, token);
            if (result.IsClaimedElsewhere)
            {
                await framework.RunOnFrameworkThread(() =>
                {
                    state.NeedsLodestoneProof = true;
                    pluginInterface.SavePluginConfig(config);
                });
                throw new UserFacingException("Ce personnage est déjà lié à un autre ordinateur. Ouvre /clavicule pour le confirmer avec ton Lodestone.");
            }
            if (!result.Ok) throw new UserFacingException(result.Message);

            await framework.RunOnFrameworkThread(() =>
            {
                state.LastHash = hash;
                state.LastUpload = DateTime.UtcNow;
                pluginInterface.SavePluginConfig(config);
            });
            Status = $"{result.Message} {built.Report.Baked} matériaux.";
            if (bakeDiagnostics != null)
            {
                Status = "Envoi du diagnostic…";
                var summary = new System.Text.Json.Nodes.JsonObject
                {
                    ["character"] = $"{state.Name}@{state.World}",
                    ["plugin"] = typeof(Exporter).Assembly.GetName().Version?.ToString(),
                    ["errors"] = new System.Text.Json.Nodes.JsonArray(built.Report.Errors.Select(e => (System.Text.Json.Nodes.JsonNode)e).ToArray()),
                };
                var sent = await sync.UploadDiagnosticsAsync(serviceUrl, secret, lodestoneId.Value, bakeDiagnostics.ToZip(summary), token);
                Status = sent.Ok ? $"{result.Message} {sent.Message}" : sent.Message;
            }
            notifications.AddNotification(new Notification
            {
                Title = "Clavicule",
                Content = "Apparence 3D envoyée à l’appli.",
                Type = NotificationType.Success,
            });
        }, token).ContinueWith(task =>
        {
            if (task.IsFaulted)
            {
                var e = task.Exception!.GetBaseException();
                Fail(hash, e is UserFacingException ? e.Message : $"Échec de l’export : {e.Message}", e is UserFacingException ? null : e, manual);
            }
            else if (task.IsCanceled)
            {
                Status = "Export annulé.";
            }
            busy = false;
        }, TaskScheduler.Default);
    }

    private void Fail(string hash, string message, Exception? e, bool manual)
    {
        if (e != null) log.Error(e, message);
        else log.Warning(message);
        failedHash = hash;
        failedAt = DateTime.UtcNow;
        Status = message;
        busy = false;
        if (manual || e != null)
        {
            notifications.AddNotification(new Notification { Title = "Clavicule", Content = message, Type = NotificationType.Warning });
        }
    }

    public async Task<string> TestConnection() => (await sync.CheckAsync(config.ServiceUrl)).Message;

    /// <summary>Étape 1 de la confirmation : obtenir le code à coller dans la présentation Lodestone.</summary>
    public async Task<string> RequestProofCode(CharacterState state)
    {
        var id = state.LodestoneId ?? await LodestoneSearch.FindAsync(http, state.Name, state.World);
        if (id == null) return "Personnage introuvable sur le Lodestone : renseigne son identifiant.";
        state.LodestoneId = id;
        var (challenge, result) = await sync.StartClaimAsync(config.ServiceUrl, state.EnsureSecret(), id.Value);
        if (challenge == null) return result.Message;
        await framework.RunOnFrameworkThread(() =>
        {
            state.ProofCode = challenge.Code;
            pluginInterface.SavePluginConfig(config);
        });
        return "Code obtenu : colle-le dans ta présentation Lodestone, enregistre, puis clique sur Vérifier.";
    }

    /// <summary>Étape 2 : le service lit la présentation ; si le code y est, ce PC reprend la main et renvoie le modèle.</summary>
    public async Task<string> VerifyProofCode(CharacterState state)
    {
        if (state.LodestoneId is not { } id) return "Demande d’abord un code.";
        var result = await sync.VerifyClaimAsync(config.ServiceUrl, state.EnsureSecret(), id);
        if (!result.Ok) return result.Message;
        await framework.RunOnFrameworkThread(() =>
        {
            state.NeedsLodestoneProof = false;
            state.ProofCode = null;
            state.LastHash = null;
            pluginInterface.SavePluginConfig(config);
        });
        SendNow();
        return $"{result.Message} Tu peux retirer le code de ta présentation.";
    }

    /// <summary>Retire le modèle du service (il ne sera plus visible dans l'appli).</summary>
    public async Task<string> DeleteModel(CharacterState state)
    {
        if (state.LodestoneId is not { } id || state.Secret.Length == 0) return "Aucun modèle envoyé depuis ce PC.";
        var result = await sync.DeleteAsync(config.ServiceUrl, state.Secret, id);
        if (result.Ok)
        {
            await framework.RunOnFrameworkThread(() =>
            {
                config.AutoUpload = false;
                state.LastHash = null;
                pluginInterface.SavePluginConfig(config);
            });
            return "Modèle supprimé. L’envoi automatique est désactivé.";
        }
        return result.Message;
    }

    public void Dispose()
    {
        framework.Update -= OnUpdate;
        disposing.Cancel();
        http.Dispose();
    }
}

/// <summary>Erreur dont le message s'affiche tel quel au joueur.</summary>
public sealed class UserFacingException(string message) : Exception(message);
