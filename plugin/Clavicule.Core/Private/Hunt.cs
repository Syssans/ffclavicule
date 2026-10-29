namespace Clavicule.Private;

/// <summary>
/// Un contrat de chasse en main : type (index du jeu), contrat tiré (ligne MobHuntOrder), victimes par cible et
/// victimes demandées.
/// </summary>
public sealed record HuntBill(int K, int Row, bool Elite, List<int> Kills, List<int> Needed);

/// <summary>Marque A ou S vue morte près du joueur. <c>At</c> en secondes Unix.</summary>
public sealed record HuntKill(int Territory, int Mark, string Rank, long At, string World);

/// <summary>Contrats en main et morts récentes des marques A/S.</summary>
public sealed record HuntProgress(List<HuntBill> Bills, List<HuntKill> Kills);

public static class HuntKills
{
    /// <summary>Au-delà, une mort ne dit plus rien de la fenêtre de réapparition.</summary>
    public const long MaxAgeSeconds = 14 * 86400;

    public const int Keep = 40;

    /// <summary>
    /// Un corps reste quelques secondes avant de disparaître : la même marque revue morte dans ce délai est la même
    /// mort. Bien plus court que le plus petit délai de retour d'un rang A (plus de deux heures).
    /// </summary>
    public const long SameDeathSeconds = 30 * 60;

    /// <summary>Note une mort vue ; faux si elle était déjà notée. Oublie les morts trop anciennes.</summary>
    public static bool Record(List<HuntKill> kills, HuntKill kill, long now)
    {
        kills.RemoveAll(k => now - k.At > MaxAgeSeconds);
        if (kills.Any(k => k.Mark == kill.Mark && k.Territory == kill.Territory && k.World == kill.World && Math.Abs(kill.At - k.At) < SameDeathSeconds))
            return false;
        kills.Add(kill);
        kills.Sort((a, b) => a.At.CompareTo(b.At));
        if (kills.Count > Keep) kills.RemoveRange(0, kills.Count - Keep);
        return true;
    }
}
