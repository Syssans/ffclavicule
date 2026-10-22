using System.Collections.Concurrent;
using Clavicule.Hud;
using Clavicule.Sync;
using Dalamud.Plugin.Services;

namespace Clavicule.Plugin;

/// <summary>
/// ATH modifiable depuis l'appli : envoie le relevé des dispositions et des barres quand il change, relève les
/// modifications déposées par le téléphone, les applique dès que le jeu le permet et renvoie le résultat.
/// Les modifications déposées jeu fermé attendent sur le service et s'appliquent à la connexion suivante.
/// </summary>
public sealed class HudSync : IDisposable
{
    private static readonly TimeSpan CheckEvery = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan MinUploadInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan PollEvery = TimeSpan.FromSeconds(10);
    /// <summary>Juste après une modification, le joueur est sans doute en train d'éditer : on relève plus souvent.</summary>
    private static readonly TimeSpan PollEveryWhileEditing = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan EditingWindow = TimeSpan.FromMinutes(3);

    private readonly Configuration config;
    private readonly IFramework framework;
    private readonly ICondition condition;
    private readonly IObjectTable objects;
    private readonly IPluginLog log;
    private readonly Exporter exporter;
    private readonly HudGame game;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly SyncClient sync;
    private readonly ConcurrentQueue<QueuedHudChange> toApply = new();
    /// <summary>Modifications déjà appliquées (ou en cours) : jamais deux fois, même si l'acquittement a échoué.</summary>
    private readonly ConcurrentDictionary<string, (string Status, string Message)> handled = new();

    private DateTime nextCheck = DateTime.MinValue;
    private DateTime nextPoll = DateTime.MinValue;
    private DateTime lastUpload = DateTime.MinValue;
    private DateTime lastChange = DateTime.MinValue;
    private string? lastHash;
    private string? characterKey;
    private volatile bool uploading;
    private volatile bool polling;

    public string Status { get; private set; } = "Pas encore envoyé.";
    public string? LastResult { get; private set; }

    public HudSync(Configuration config, IFramework framework, ICondition condition, IObjectTable objects, IPluginLog log,
                   Exporter exporter, IDataManager data)
    {
        this.config = config;
        this.framework = framework;
        this.condition = condition;
        this.objects = objects;
        this.log = log;
        this.exporter = exporter;
        game = new HudGame(data);
        sync = new SyncClient(http);
        framework.Update += OnUpdate;
    }

    private void OnUpdate(IFramework _)
    {
        if (!config.HudSync || !config.IsReady || objects.LocalPlayer == null) return;
        var current = exporter.CurrentCharacter();
        if (current is not { } c || !PrivateSync.IsLinked(c.state) || c.state.NeedsLodestoneProof) return;
        if (characterKey != c.key)
        {
            // Changement de personnage : tout repart de zéro.
            characterKey = c.key;
            lastHash = null;
            toApply.Clear();
            nextPoll = DateTime.MinValue;
        }
        var serviceUrl = config.ServiceUrl;
        var secret = c.state.Secret;
        var id = c.state.LodestoneId!.Value;

        ApplyWaiting(serviceUrl, secret, id);
        Poll(serviceUrl, secret, id);
        Upload(serviceUrl, secret, id);
    }

    private void Poll(string serviceUrl, string secret, long id)
    {
        if (polling || DateTime.UtcNow < nextPoll) return;
        var editing = DateTime.UtcNow - lastChange < EditingWindow;
        nextPoll = DateTime.UtcNow + (editing ? PollEveryWhileEditing : PollEvery);
        polling = true;
        Task.Run(async () =>
        {
            var (changes, result) = await sync.PendingHudChangesAsync(serviceUrl, secret, id);
            if (changes == null)
            {
                if (result.Code != "unreachable") log.Debug("Relevé des modifications de l'ATH : {Message}", result.Message);
                return;
            }
            foreach (var change in changes)
            {
                if (handled.TryGetValue(change.Id, out var done))
                {
                    // Déjà appliquée, mais le service ne l'a pas su : on renvoie le résultat.
                    await sync.FinishHudChangeAsync(serviceUrl, secret, id, change.Id, done.Status, done.Message);
                    continue;
                }
                if (toApply.Any(c => c.Id == change.Id)) continue;
                toApply.Enqueue(change);
            }
        }).ContinueWith(_ => polling = false);
    }

    private void ApplyWaiting(string serviceUrl, string secret, long id)
    {
        if (toApply.IsEmpty) return;
        if (HudGame.Busy(condition) is { } reason)
        {
            Status = $"Modification en attente : {reason}.";
            return;
        }
        while (toApply.TryDequeue(out var change))
        {
            if (handled.ContainsKey(change.Id)) continue;
            (string Status, string Message) result;
            try
            {
                result = Apply(change.Change);
            }
            catch (Exception e)
            {
                log.Error(e, "Modification de l'ATH impossible");
                result = ("failed", $"Erreur du plugin : {e.Message}");
            }
            handled[change.Id] = result;
            lastChange = DateTime.UtcNow;
            LastResult = $"{DateTime.Now:HH:mm} · {result.Message}";
            log.Information("ATH modifié depuis {Device} : {Message}", change.Device, result.Message);
            var changeId = change.Id;
            _ = sync.FinishHudChangeAsync(serviceUrl, secret, id, changeId, result.Status, result.Message);
        }
        // Le nouveau relevé part tout de suite pour que l'appli voie le résultat.
        lastHash = null;
        lastUpload = DateTime.MinValue;
        nextCheck = DateTime.MinValue;
    }

    private (string Status, string Message) Apply(HudChange change)
    {
        switch (change.Kind)
        {
            case "layout" when change.Layout is { } layout && change.Elements is { } elements:
            {
                var (done, refused) = game.ApplyLayout(layout, elements);
                var text = $"{done} élément(s) réglé(s) dans la disposition {layout + 1}.";
                if (refused.Count > 0) text += $" Refusé : {string.Join(" ; ", refused.Take(5))}.";
                return (Outcome(done, refused.Count), text);
            }
            case "activate" when change.Layout is { } layout:
                return game.Activate(layout) ? ("applied", $"Disposition {layout + 1} activée.") : ("failed", "Disposition inconnue.");
            case "hotbars" when change.Job is { } job && change.Slots is { } slots:
            {
                var (done, refused) = game.ApplyHotbars(job, slots);
                var text = $"{done} case(s) modifiée(s).";
                if (refused > 0) text += $" {refused} refusée(s) : le contenu doit déjà se trouver dans les barres de ce job.";
                return (Outcome(done, refused), text);
            }
            default:
                return ("failed", "Modification inconnue de cette version du plugin : mets-le à jour.");
        }
    }

    private static string Outcome(int done, int refused) => done == 0 ? "failed" : refused > 0 ? "partial" : "applied";

    private void Upload(string serviceUrl, string secret, long id)
    {
        if (uploading || DateTime.UtcNow < nextCheck) return;
        nextCheck = DateTime.UtcNow + CheckEvery;
        HudSnapshot? snapshot;
        try
        {
            snapshot = game.Collect();
        }
        catch (Exception e)
        {
            log.Warning(e, "Relevé de l'ATH impossible");
            return;
        }
        if (snapshot == null) return;
        var hash = snapshot.ContentHash();
        if (hash == lastHash || DateTime.UtcNow - lastUpload < MinUploadInterval) return;

        var json = snapshot.ToJson();
        uploading = true;
        Task.Run(async () =>
        {
            var result = await sync.UploadHudAsync(serviceUrl, secret, id, json);
            if (result.Ok) lastHash = hash;
            Status = result.Ok ? $"Envoyé à {DateTime.Now:HH:mm}." : result.Message;
            lastUpload = DateTime.UtcNow;
        }).ContinueWith(t =>
        {
            if (t.IsFaulted) Status = $"Envoi impossible : {t.Exception!.GetBaseException().Message}";
            uploading = false;
        });
    }

    /// <summary>Renvoie le relevé et relève les modifications au prochain passage.</summary>
    public void SendSoon()
    {
        lastHash = null;
        lastUpload = DateTime.MinValue;
        nextCheck = DateTime.MinValue;
        nextPoll = DateTime.MinValue;
    }

    public void Dispose()
    {
        framework.Update -= OnUpdate;
        http.Dispose();
    }
}
