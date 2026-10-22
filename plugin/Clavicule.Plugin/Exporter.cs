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
        if (current == null) return;
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
        Start(character, current.Value.state, hash, manual: false);
    }

    /// <summary>Envoi demandé depuis la fenêtre ou la commande.</summary>
    public unsafe void SendNow()
    {
        framework.RunOnFrameworkThread(() =>
        {
            if (busy) return;
            if (!config.IsReady)
            {
                Status = "Renseigne d’abord l’adresse du service et ta clé d’écriture.";
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
            Start(character, current.Value.state, Appearance.Hash(character, config.IncludeWeapons), manual: true);
        });
    }

    private unsafe void Start(Character* character, CharacterState state, string hash, bool manual)
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

        Upload(info, state, hash, manual);
    }

    private void Upload(Meddle.Plugin.Models.Layout.ParsedCharacterInfo info, CharacterState state, string hash, bool manual)
    {
        var options = new BakeOptions { MaxTextureSize = config.MaxTextureSize, Normals = config.Normals };
        var serviceUrl = config.ServiceUrl;
        var writeKey = config.WriteKey;
        var token = disposing.Token;
        Task.Run(async () =>
        {
            Status = "Création du modèle 3D…";
            var built = meddle.Build(info, state.Name, options, token);
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
            var result = await sync.UploadAsync(serviceUrl, writeKey, lodestoneId.Value, built.Glb, state.Name, state.World, hash, token);
            if (!result.Ok) throw new UserFacingException(result.Message);

            await framework.RunOnFrameworkThread(() =>
            {
                state.LastHash = hash;
                state.LastUpload = DateTime.UtcNow;
                pluginInterface.SavePluginConfig(config);
            });
            Status = $"{result.Message} {built.Report.Baked} matériaux.";
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

    public async Task<string> TestConnection()
    {
        var result = await sync.CheckAsync(config.ServiceUrl, config.WriteKey);
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
