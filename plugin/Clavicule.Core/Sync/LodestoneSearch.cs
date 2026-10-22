using System.Net;
using System.Text.RegularExpressions;

namespace Clavicule.Sync;

/// <summary>Retrouve l'identifiant Lodestone d'un personnage à partir de son nom et de son monde.</summary>
public static partial class LodestoneSearch
{
    public static Uri SearchUri(string name, string world) =>
        new($"https://eu.finalfantasyxiv.com/lodestone/character/?q={Uri.EscapeDataString(name)}&worldname={Uri.EscapeDataString(world)}");

    [GeneratedRegex("""href="/lodestone/character/(\d+)/"\s+class="entry__link".*?<p class="entry__name">([^<]+)</p>""",
                    RegexOptions.Singleline)]
    private static partial Regex EntryRegex();

    /// <summary>Identifiant du résultat dont le nom correspond exactement, ou null.</summary>
    public static long? ParseCharacterId(string html, string name)
    {
        foreach (Match match in EntryRegex().Matches(html))
        {
            var entryName = WebUtility.HtmlDecode(match.Groups[2].Value).Trim();
            if (string.Equals(entryName, name.Trim(), StringComparison.OrdinalIgnoreCase))
                return long.Parse(match.Groups[1].Value);
        }
        return null;
    }

    public static async Task<long?> FindAsync(HttpClient http, string name, string world, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, SearchUri(name, world));
        request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Clavicule");
        using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        var html = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        return ParseCharacterId(html, name);
    }
}
