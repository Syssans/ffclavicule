namespace Clavicule.Private;

/// <summary>Cycles du jeu : numéro du jour et de la semaine en cours, comptés depuis 1970 en heure du serveur (UTC).</summary>
public static class ResetCycles
{
    /// <summary>Réinitialisation quotidienne : 15 h UTC.</summary>
    private const long DailyOffset = 15 * 3600;

    /// <summary>Réinitialisation hebdomadaire : mardi 8 h UTC (le 6 janvier 1970 était un mardi).</summary>
    private const long WeeklyOffset = 5 * 86400 + 8 * 3600;

    public static long Daily(DateTime utc) => FloorDiv(Unix(utc) - DailyOffset, 86400);

    public static long Weekly(DateTime utc) => FloorDiv(Unix(utc) - WeeklyOffset, 7 * 86400);

    private static long Unix(DateTime utc) => new DateTimeOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc)).ToUnixTimeSeconds();

    private static long FloorDiv(long a, long b) => a >= 0 ? a / b : -((-a + b - 1) / b);
}

/// <summary>Carnet de Khloé (aventures imaginaires) : vignettes posées et date d'expiration.</summary>
public sealed record WondrousTails(
    bool Journal,
    int Stickers,
    /// <summary>Expiration du carnet (secondes Unix), 0 sans carnet.</summary>
    long ExpiresAt,
    int SecondChances,
    /// <summary>Carnet complet rendu à Khloé cette semaine.</summary>
    bool TurnedIn);

/// <summary>
/// Tâches quotidiennes et hebdomadaires lues en jeu. Les numéros de cycle font partie du contenu : passer une
/// réinitialisation en jeu provoque un nouvel envoi, et l'appli sait que les valeurs sont de ce jour-là.
/// </summary>
public sealed record DutyProgress(
    DateTime UpdatedAt,
    long DailyCycle,
    long WeeklyCycle,
    /// <summary>Missions aléatoires terminées aujourd'hui (numéros de la feuille ContentRoulette).</summary>
    List<int> Roulettes,
    /// <summary>Autorisations restantes pour les quêtes des peuples alliés.</summary>
    int? TribeAllowances,
    /// <summary>Prochaine carte au trésor récoltable (secondes Unix), 0 si une carte peut déjà être récoltée.</summary>
    long? MapReadyAt,
    /// <summary>Commandes spéciales restantes cette semaine.</summary>
    int? Deliveries,
    WondrousTails? Bingo,
    /// <summary>Mémoquartz limités gagnés cette semaine et plafond.</summary>
    int? Tomestones,
    int? TomestoneLimit,
    /// <summary>Contrats de chasse en main et marques A/S vues mortes.</summary>
    HuntProgress? Hunt = null)
{
    /// <summary>Missions aléatoires suivies : celles de l'outil de mission qui donnent un bonus quotidien.</summary>
    public static readonly int[] TrackedRoulettes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 17];

    public const int StickersPerJournal = 9;
}

/// <summary>Mémoire du carnet de Khloé : un carnet complet qui disparaît a été rendu.</summary>
public sealed record BingoMemory(long WeeklyCycle, bool SeenComplete, bool TurnedIn);

public static class WondrousTailsTracker
{
    /// <summary>
    /// Met à jour la mémoire avec le carnet lu et rend l'état à envoyer. Un carnet complet vu cette semaine, puis
    /// absent, a été rendu à Khloé.
    /// </summary>
    public static (WondrousTails state, BingoMemory memory) Track(BingoMemory? memory, long weeklyCycle, bool journal, int stickers,
                                                                  long expiresAt, int secondChances)
    {
        var known = memory != null && memory.WeeklyCycle == weeklyCycle ? memory : new BingoMemory(weeklyCycle, false, false);
        var complete = journal && stickers >= DutyProgress.StickersPerJournal;
        var turnedIn = known.TurnedIn || (!journal && known.SeenComplete);
        var next = new BingoMemory(weeklyCycle, known.SeenComplete || complete, turnedIn);
        return (new WondrousTails(journal, journal ? stickers : 0, journal ? expiresAt : 0, secondChances, turnedIn), next);
    }
}
