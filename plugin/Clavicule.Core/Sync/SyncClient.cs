using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;

namespace Clavicule.Sync;

/// <summary>Résultat d'un appel : message lisible et code stable renvoyé par le service (ex. « claimed »).</summary>
public sealed record SyncResult(bool Ok, string Message, string? Code = null)
{
    /// <summary>Le personnage est lié à un autre ordinateur : il faut le confirmer avec le code Lodestone.</summary>
    public bool IsClaimedElsewhere => Code == "claimed";
}

public sealed record ClaimChallenge(string Code, DateTime ExpiresAt, string ProfileUrl);

/// <summary>
/// Client du service Clavicule Sync (dossier server/ du dépôt). Aucune clé à saisir : chaque personnage
/// a un secret généré par le plugin, que le service associe au personnage au premier envoi.
/// </summary>
public sealed class SyncClient
{
    private readonly HttpClient http;

    public SyncClient(HttpClient http) => this.http = http;

    /// <summary>Secret aléatoire (256 bits) propre à un personnage, gardé dans la configuration du plugin.</summary>
    public static string NewSecret() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>« clavicule-sync.x.workers.dev/ » -> « https://clavicule-sync.x.workers.dev ».</summary>
    public static string NormalizeUrl(string raw)
    {
        var url = raw.Trim().TrimEnd('/');
        if (url.Length == 0) return "";
        return url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                   ? url
                   : "https://" + url;
    }

    private static HttpRequestMessage Request(HttpMethod method, string serviceUrl, string path, string? secret)
    {
        var request = new HttpRequestMessage(method, $"{NormalizeUrl(serviceUrl)}{path}");
        if (secret != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret);
        return request;
    }

    private async Task<(HttpResponseMessage? response, SyncResult? failure)> Send(HttpRequestMessage request, CancellationToken ct)
    {
        try
        {
            return (await http.SendAsync(request, ct).ConfigureAwait(false), null);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or UriFormatException or InvalidOperationException)
        {
            return (null, new SyncResult(false, $"Service injoignable : {e.Message}", "unreachable"));
        }
    }

    /// <summary>Message et code d'erreur du service (corps JSON { error, code }).</summary>
    private static async Task<SyncResult> Failure(HttpResponseMessage response, CancellationToken ct)
    {
        var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        try
        {
            using var doc = JsonDocument.Parse(body);
            var message = doc.RootElement.TryGetProperty("error", out var e) ? e.GetString() : null;
            var code = doc.RootElement.TryGetProperty("code", out var c) ? c.GetString() : null;
            if (message != null) return new SyncResult(false, message, code);
        }
        catch (JsonException)
        {
            // Réponse non JSON : on garde le code HTTP.
        }
        return new SyncResult(false, $"Réponse inattendue du service (HTTP {(int)response.StatusCode}).", "http");
    }

    public async Task<SyncResult> CheckAsync(string serviceUrl, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Get, serviceUrl, "/health", null);
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return failure;
        using (response)
        {
            return response!.IsSuccessStatusCode ? new SyncResult(true, "Service joignable.") : await Failure(response, ct).ConfigureAwait(false);
        }
    }

    public async Task<SyncResult> UploadAsync(string serviceUrl, string secret, long characterId, byte[] glb,
                                              string name, string world, string appearanceHash, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Put, serviceUrl, $"/v1/characters/{characterId}/model", secret);
        request.Headers.Add("X-Character-Name", Uri.EscapeDataString(name));
        request.Headers.Add("X-Character-World", Uri.EscapeDataString(world));
        request.Headers.Add("X-Appearance-Hash", appearanceHash);
        request.Content = new ByteArrayContent(glb);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("model/gltf-binary");
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return failure;
        using (response)
        {
            if (response!.IsSuccessStatusCode) return new SyncResult(true, $"Modèle envoyé ({glb.Length / 1024 / 1024.0:0.0} Mo).");
            return await Failure(response, ct).ConfigureAwait(false);
        }
    }

    /// <summary>Envoie le diagnostic des couleurs (.zip) pour aider à corriger la cuisson des matériaux.</summary>
    public async Task<SyncResult> UploadDiagnosticsAsync(string serviceUrl, string secret, long characterId, byte[] zip, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Put, serviceUrl, $"/v1/characters/{characterId}/debug", secret);
        request.Content = new ByteArrayContent(zip);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return failure;
        using (response)
        {
            return response!.IsSuccessStatusCode
                       ? new SyncResult(true, $"Diagnostic envoyé ({zip.Length / 1024} Ko).")
                       : await Failure(response, ct).ConfigureAwait(false);
        }
    }

    /// <summary>Envoie les données privées (inventaire, servants, courrier), lisibles seulement par les téléphones associés.</summary>
    public async Task<SyncResult> UploadPrivateAsync(string serviceUrl, string secret, long characterId, string json, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Put, serviceUrl, $"/v1/characters/{characterId}/private", secret);
        request.Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return failure;
        using (response)
        {
            return response!.IsSuccessStatusCode ? new SyncResult(true, "Données envoyées.") : await Failure(response, ct).ConfigureAwait(false);
        }
    }

    public sealed record PairingCode(string Code, DateTime ExpiresAt);

    /// <summary>Code à 6 chiffres à saisir dans l'appli pour associer un téléphone (valable 10 minutes).</summary>
    public async Task<(PairingCode? code, SyncResult result)> CreatePairingAsync(string serviceUrl, string secret, long characterId,
                                                                                   string name, string world, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Post, serviceUrl, $"/v1/characters/{characterId}/pairing", secret);
        request.Content = new StringContent(JsonSerializer.Serialize(new { name, world }), System.Text.Encoding.UTF8, "application/json");
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return (null, failure);
        using (response)
        {
            if (!response!.IsSuccessStatusCode) return (null, await Failure(response, ct).ConfigureAwait(false));
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false));
            return (new PairingCode(doc.RootElement.GetProperty("code").GetString()!, doc.RootElement.GetProperty("expiresAt").GetDateTime()),
                    new SyncResult(true, "Code obtenu."));
        }
    }

    public sealed record PairedDevice(string Id, string Name, DateTime CreatedAt, DateTime LastSeen);

    public async Task<(IReadOnlyList<PairedDevice>? devices, SyncResult result)> ListDevicesAsync(string serviceUrl, string secret, long characterId,
                                                                                                     CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Get, serviceUrl, $"/v1/characters/{characterId}/devices", secret);
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return (null, failure);
        using (response)
        {
            if (!response!.IsSuccessStatusCode) return (null, await Failure(response, ct).ConfigureAwait(false));
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false));
            var list = doc.RootElement.GetProperty("devices").EnumerateArray()
                          .Select(d => new PairedDevice(d.GetProperty("id").GetString()!, d.GetProperty("name").GetString()!,
                                                        d.GetProperty("createdAt").GetDateTime(), d.GetProperty("lastSeen").GetDateTime()))
                          .ToList();
            return (list, new SyncResult(true, $"{list.Count} téléphone(s) associé(s)."));
        }
    }

    public async Task<SyncResult> RevokeDeviceAsync(string serviceUrl, string secret, long characterId, string deviceId, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Delete, serviceUrl, $"/v1/characters/{characterId}/devices/{Uri.EscapeDataString(deviceId)}", secret);
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return failure;
        using (response)
        {
            return response!.IsSuccessStatusCode ? new SyncResult(true, "Téléphone retiré.") : await Failure(response, ct).ConfigureAwait(false);
        }
    }

    public async Task<SyncResult> DeleteAsync(string serviceUrl, string secret, long characterId, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Delete, serviceUrl, $"/v1/characters/{characterId}/model", secret);
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return failure;
        using (response)
        {
            return response!.IsSuccessStatusCode ? new SyncResult(true, "Modèle supprimé.") : await Failure(response, ct).ConfigureAwait(false);
        }
    }

    /// <summary>Demande un code à coller dans la présentation Lodestone pour lier ce personnage à ce secret.</summary>
    public async Task<(ClaimChallenge? challenge, SyncResult result)> StartClaimAsync(string serviceUrl, string secret, long characterId,
                                                                                      CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Post, serviceUrl, $"/v1/characters/{characterId}/claim", secret);
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return (null, failure);
        using (response)
        {
            if (!response!.IsSuccessStatusCode) return (null, await Failure(response, ct).ConfigureAwait(false));
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false));
            var root = doc.RootElement;
            var challenge = new ClaimChallenge(root.GetProperty("code").GetString()!,
                                               root.GetProperty("expiresAt").GetDateTime(),
                                               root.GetProperty("profileUrl").GetString()!);
            return (challenge, new SyncResult(true, "Code obtenu."));
        }
    }

    /// <summary>Vérifie que le code est bien dans la présentation Lodestone ; le personnage est alors lié à ce secret.</summary>
    public async Task<SyncResult> VerifyClaimAsync(string serviceUrl, string secret, long characterId, CancellationToken ct = default)
    {
        using var request = Request(HttpMethod.Post, serviceUrl, $"/v1/characters/{characterId}/claim/verify", secret);
        var (response, failure) = await Send(request, ct).ConfigureAwait(false);
        if (failure != null) return failure;
        using (response)
        {
            return response!.IsSuccessStatusCode
                       ? new SyncResult(true, "Personnage confirmé : il est maintenant lié à cet ordinateur.")
                       : await Failure(response, ct).ConfigureAwait(false);
        }
    }
}
