using Clavicule.Private;
using Clavicule.Sync;
using Dalamud.Game.Chat;
using Dalamud.Game.Text;
using Dalamud.Game.Text.SeStringHandling.Payloads;
using Dalamud.Game.ClientState.Objects.SubKinds;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;

namespace Clavicule.Plugin;

/// <summary>
/// Relève régulièrement inventaire, servants et courrier et les envoie quand ils changent.
/// Ces données ne sont lisibles que par les téléphones associés au personnage.
/// </summary>
public sealed class PrivateSync : IDisposable
{
    private static readonly TimeSpan CheckEvery = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan MinInterval = TimeSpan.FromSeconds(60);

    private readonly IDalamudPluginInterface pluginInterface;
    private readonly Configuration config;
    private readonly IFramework framework;
    private readonly IObjectTable objects;
    private readonly IPluginLog log;
    private readonly Exporter exporter;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(30) };
    private readonly SyncClient sync;
    private readonly Dictionary<string, PrivateMemory> memories = new();
    private readonly CollectionCollector collections;
    private readonly ICondition condition;
    private readonly IChatGui chat;
    /// <summary>Personnages pour lesquels les hauts faits ont déjà été demandés au serveur pendant cette session.</summary>
    private readonly HashSet<string> achievementsRequested = new();

    private Task<Clavicule.Collections.CollectionCatalog?>? catalog;
    private volatile bool catalogUploading;
    private DateTime nextCheck = DateTime.MinValue;
    private DateTime lastUpload = DateTime.MinValue;
    private string? lastHash;
    private volatile bool uploading;

    public string Status { get; private set; } = "Pas encore envoyées.";

    public PrivateSync(IDalamudPluginInterface pluginInterface, Configuration config, IFramework framework, IObjectTable objects,
                       IPluginLog log, Exporter exporter, IDataManager data, ICondition condition, IChatGui chat)
    {
        this.chat = chat;
        chat.ChatMessageUnhandled += OnChat;
        collections = new CollectionCollector(data, log);
        this.condition = condition;
        this.pluginInterface = pluginInterface;
        this.config = config;
        this.framework = framework;
        this.objects = objects;
        this.log = log;
        this.exporter = exporter;
        sync = new SyncClient(http);
        framework.Update += OnUpdate;
    }

    private string MemoryPath(string key) =>
        Path.Combine(pluginInterface.GetPluginConfigDirectory(), $"prive-{string.Concat(key.Where(char.IsLetterOrDigit))}.json");

    private PrivateMemory MemoryFor(string key)
    {
        if (!memories.TryGetValue(key, out var memory))
        {
            var path = MemoryPath(key);
            memory = PrivateMemory.FromJson(File.Exists(path) ? File.ReadAllText(path) : null);
            memories[key] = memory;
        }
        return memory;
    }

    /// <summary>Le personnage peut-il envoyer des données privées ? (il faut qu'il soit lié à ce PC par l'envoi du modèle)</summary>
    public static bool IsLinked(CharacterState state) => state.LodestoneId != null && state.Secret.Length > 0 && state.LastUpload != null;

    private void OnUpdate(IFramework _)
    {
        if (!config.PrivateSync || !config.IsReady || uploading || DateTime.UtcNow < nextCheck) return;
        nextCheck = DateTime.UtcNow + CheckEvery;
        if (objects.LocalPlayer is not IPlayerCharacter player) return;
        var current = exporter.CurrentCharacter();
        if (current is not { } c || !IsLinked(c.state) || c.state.NeedsLodestoneProof) return;

        // Hauts faits, titres et minuteurs ne sont chargés par le jeu que sur demande (fenêtres du jeu) : une demande par session.
        if (!condition[Dalamud.Game.ClientState.Conditions.ConditionFlag.InCombat] && achievementsRequested.Add(c.key))
        {
            try
            {
                CollectionCollector.RequestAchievements();
                CollectionCollector.RequestTitles();
                PrivateCollector.RequestTimers();
            }
            catch (Exception e)
            {
                log.Warning(e, "Demande des hauts faits impossible");
            }
        }

        SendCatalog(c.state);

        PrivateSnapshot? snapshot;
        var memory = MemoryFor(c.key);
        try
        {
            snapshot = PrivateCollector.Collect(player, memory, collections);
        }
        catch (Exception e)
        {
            log.Warning(e, "Relevé des données privées impossible");
            return;
        }
        if (snapshot == null) return;
        var hash = snapshot.ContentHash();
        if (hash == lastHash || DateTime.UtcNow - lastUpload < MinInterval) return;

        var json = snapshot.ToJson();
        var memoryJson = memory.ToJson();
        var path = MemoryPath(c.key);
        var serviceUrl = config.ServiceUrl;
        var secret = c.state.Secret;
        var id = c.state.LodestoneId!.Value;
        uploading = true;
        Task.Run(async () =>
        {
            await File.WriteAllTextAsync(path, memoryJson);
            var result = await sync.UploadPrivateAsync(serviceUrl, secret, id, json);
            if (result.Ok)
            {
                lastHash = hash;
                Status = $"Envoyées à {DateTime.Now:HH:mm}.";
            }
            else
            {
                Status = result.Message;
            }
            lastUpload = DateTime.UtcNow;
        }).ContinueWith(t =>
        {
            if (t.IsFaulted) Status = $"Envoi impossible : {t.Exception!.GetBaseException().Message}";
            uploading = false;
        });
    }

    /// <summary>
    /// Catalogue des collections : construit une fois par session en tâche de fond (quelques secondes de lecture
    /// des données du jeu), envoyé seulement s'il a changé depuis le dernier envoi pour ce personnage.
    /// </summary>
    private void SendCatalog(CharacterState state)
    {
        catalog ??= Task.Run(() =>
        {
            try
            {
                return (Clavicule.Collections.CollectionCatalog?)collections.BuildCatalog();
            }
            catch (Exception e)
            {
                log.Warning(e, "Catalogue des collections impossible à construire");
                return null;
            }
        });
        if (!catalog.IsCompleted || catalogUploading || catalog.Result is not { } built) return;
        var hash = built.ContentHash();
        if (hash == state.CatalogHash) return;

        catalogUploading = true;
        var serviceUrl = config.ServiceUrl;
        var secret = state.Secret;
        var id = state.LodestoneId!.Value;
        Task.Run(async () =>
        {
            var result = await sync.UploadCatalogAsync(serviceUrl, secret, id, built.ToJson());
            if (result.Ok)
            {
                state.CatalogHash = hash;
                pluginInterface.SavePluginConfig(config);
            }
            else
            {
                log.Warning("Envoi du catalogue : {Message}", result.Message);
            }
        }).ContinueWith(_ => catalogUploading = false);
    }

    /// <summary>
    /// Vente d'un servant annoncée par le jeu pendant qu'on joue : l'annonce quitte la liste connue et la vente part
    /// au prochain envoi, sans repasser à la sonnette.
    /// </summary>
    private void OnChat(IChatMessage message)
    {
        if (message.LogKind != XivChatType.RetainerSale || !config.PrivateSync) return;
        try
        {
            var item = message.Message.Payloads.OfType<ItemPayload>().FirstOrDefault();
            if (item == null || item.ItemId == 0) return;
            if (exporter.CurrentCharacter() is not { } c || !IsLinked(c.state)) return;
            var sale = SaleMatcher.Record(MemoryFor(c.key), item.ItemId, item.IsHQ, SaleText.Gil(message.Message.TextValue), DateTime.UtcNow);
            log.Debug("Vente relevée : objet {Item} ({Qty}) pour {Gil} gils", sale.Id, sale.Qty, sale.Gil);
            nextCheck = DateTime.MinValue;
        }
        catch (Exception e)
        {
            log.Warning(e, "Lecture d'une vente impossible");
        }
    }

    /// <summary>Renvoie tout au prochain passage (après association d'un téléphone, par exemple).</summary>
    public void SendSoon()
    {
        lastHash = null;
        lastUpload = DateTime.MinValue;
        nextCheck = DateTime.MinValue;
    }

    public Task<(SyncClient.PairingCode? code, SyncResult result)> CreatePairing(CharacterState state) =>
        sync.CreatePairingAsync(config.ServiceUrl, state.Secret, state.LodestoneId!.Value, state.Name, state.World);

    public Task<(IReadOnlyList<SyncClient.PairedDevice>? devices, SyncResult result)> ListDevices(CharacterState state) =>
        sync.ListDevicesAsync(config.ServiceUrl, state.Secret, state.LodestoneId!.Value);

    public Task<SyncResult> RevokeDevice(CharacterState state, string deviceId) =>
        sync.RevokeDeviceAsync(config.ServiceUrl, state.Secret, state.LodestoneId!.Value, deviceId);

    public void Dispose()
    {
        framework.Update -= OnUpdate;
        chat.ChatMessageUnhandled -= OnChat;
        http.Dispose();
    }
}
