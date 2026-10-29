using System.Text.RegularExpressions;

namespace Clavicule.Private;

/// <summary>Une vente d'un servant, annoncée par le jeu dans le chat pendant qu'on joue.</summary>
public sealed record RetainerSale(
    uint Id,
    bool Hq,
    int Qty,
    /// <summary>Prix unitaire de l'annonce vendue (0 si l'annonce n'était pas connue).</summary>
    ulong Price,
    /// <summary>Gils reçus, taxes déduites, tels que les annonce le jeu (0 si illisibles).</summary>
    uint Gil,
    string RetainerId,
    string Retainer,
    /// <summary>Secondes Unix.</summary>
    long At);

public static partial class SaleText
{
    // « 1,234 gil », « 1 234 gils », « 1.234 Gil » : le nombre qui précède le mot « gil ».
    [GeneratedRegex(@"(\d[\d\s.,'  ]*)\s*gils?\b", RegexOptions.IgnoreCase)]
    private static partial Regex GilPattern();

    /// <summary>Gils annoncés par le message de vente, ou 0.</summary>
    public static uint Gil(string text)
    {
        var match = GilPattern().Match(text);
        if (!match.Success) return 0;
        var digits = new string(match.Groups[1].Value.Where(char.IsAsciiDigit).ToArray());
        return uint.TryParse(digits, out var gil) ? gil : 0;
    }
}

public static class SaleMatcher
{
    public const int Keep = 50;
    private static readonly TimeSpan KeepFor = TimeSpan.FromDays(30);

    /// <summary>
    /// Enregistre une vente : retire l'annonce correspondante des ventes connues du servant (une annonce part
    /// toujours en entier) et garde la vente dans l'historique. Parmi plusieurs annonces du même objet, celle dont
    /// le total est le plus proche des gils reçus.
    /// </summary>
    public static RetainerSale Record(PrivateMemory memory, uint itemId, bool hq, uint gil, DateTime now)
    {
        (RetainerInfo retainer, MarketListing listing)? best = null;
        foreach (var r in memory.Retainers.Values)
        {
            foreach (var l in r.Market ?? [])
            {
                if (l.Id != itemId || l.Hq != hq) continue;
                if (best == null || Distance(l, gil) < Distance(best.Value.listing, gil)) best = (r, l);
            }
        }

        var at = new DateTimeOffset(DateTime.SpecifyKind(now, DateTimeKind.Utc)).ToUnixTimeSeconds();
        RetainerSale sale;
        if (best is { } found)
        {
            var market = found.retainer.Market!.ToList();
            market.Remove(found.listing);
            memory.Retainers[found.retainer.Id] = found.retainer with { Market = market };
            sale = new RetainerSale(itemId, hq, found.listing.Qty, found.listing.Price, gil, found.retainer.Id, found.retainer.Name, at);
        }
        else
        {
            sale = new RetainerSale(itemId, hq, 0, 0, gil, "", "", at);
        }

        var limit = at - (long)KeepFor.TotalSeconds;
        memory.Sales = memory.Sales.Where(s => s.At >= limit).Append(sale).TakeLast(Keep).ToList();
        return sale;
    }

    private static double Distance(MarketListing l, uint gil) => gil == 0 ? 0 : Math.Abs((double)l.Price * l.Qty - gil);
}
