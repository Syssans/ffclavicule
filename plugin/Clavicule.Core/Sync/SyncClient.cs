using System.Net;
using System.Net.Http.Headers;

namespace Clavicule.Sync;

public sealed record SyncResult(bool Ok, string Message);

/// <summary>Client du service Clavicule Sync (dossier server/ du dépôt).</summary>
public sealed class SyncClient
{
    private readonly HttpClient http;

    public SyncClient(HttpClient http) => this.http = http;

    /// <summary>« clavicule-sync.x.workers.dev/ » -> « https://clavicule-sync.x.workers.dev ».</summary>
    public static string NormalizeUrl(string raw)
    {
        var url = raw.Trim().TrimEnd('/');
        if (url.Length == 0) return "";
        return url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                   ? url
                   : "https://" + url;
    }

    /// <summary>Vérifie l'adresse et la clé (une clé d'écriture permet aussi de lire la liste).</summary>
    public async Task<SyncResult> CheckAsync(string serviceUrl, string key, CancellationToken ct = default)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{NormalizeUrl(serviceUrl)}/v1/characters");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key.Trim());
            using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
            return response.StatusCode switch
            {
                HttpStatusCode.OK => new SyncResult(true, "Connexion au service réussie."),
                HttpStatusCode.Unauthorized => new SyncResult(false, "Clé refusée par le service."),
                _ => new SyncResult(false, $"Réponse inattendue du service (HTTP {(int)response.StatusCode})."),
            };
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or UriFormatException or InvalidOperationException)
        {
            return new SyncResult(false, $"Service injoignable : {e.Message}");
        }
    }

    public async Task<SyncResult> UploadAsync(string serviceUrl, string writeKey, long characterId, byte[] glb,
                                              string name, string world, string appearanceHash, CancellationToken ct = default)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Put, $"{NormalizeUrl(serviceUrl)}/v1/characters/{characterId}/model");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", writeKey.Trim());
            request.Headers.Add("X-Character-Name", Uri.EscapeDataString(name));
            request.Headers.Add("X-Character-World", Uri.EscapeDataString(world));
            request.Headers.Add("X-Appearance-Hash", appearanceHash);
            request.Content = new ByteArrayContent(glb);
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("model/gltf-binary");
            using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
            if (response.IsSuccessStatusCode)
                return new SyncResult(true, $"Modèle envoyé ({glb.Length / 1024 / 1024.0:0.0} Mo).");
            var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            return response.StatusCode switch
            {
                HttpStatusCode.Unauthorized => new SyncResult(false, "Clé d’écriture refusée par le service."),
                HttpStatusCode.RequestEntityTooLarge => new SyncResult(false, "Modèle trop lourd pour le service : baisse la taille des textures."),
                _ => new SyncResult(false, $"Envoi refusé (HTTP {(int)response.StatusCode}) : {body}"),
            };
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or UriFormatException or InvalidOperationException)
        {
            return new SyncResult(false, $"Service injoignable : {e.Message}");
        }
    }
}
