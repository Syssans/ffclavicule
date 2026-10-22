namespace Clavicule.Hud;

/// <summary>Famille d'un élément de l'ATH, pour que l'appli range et filtre la liste.</summary>
public static class HudGroup
{
    public const string Main = "main";
    public const string Hotbar = "hotbar";
    public const string Gauge = "gauge";
    public const string Content = "content";
    public const string Pvp = "pvp";
}

/// <summary>Élément de l'ATH connu : son addon, sa ligne dans la feuille « Hud » (nom traduit par le jeu) et sa famille.</summary>
public sealed record HudElementInfo(string Addon, int HudRow, string Group, string? Job = null, int? Hotbar = null)
{
    /// <summary>Identifiant de l'élément dans les dispositions : CRC32 de « {addon}_a ».</summary>
    public uint Hash { get; } = Crc32.Of($"{Addon}_a");
}

/// <summary>
/// Éléments que l'éditeur d'ATH du jeu sait placer (patch 7.5). Les numéros de ligne de la feuille « Hud » et la
/// règle de hachage viennent du plugin HUD Manager (GPL-3.0).
/// </summary>
public static class HudCatalog
{
    public static readonly IReadOnlyList<HudElementInfo> All =
    [
        new("_ActionBar", 0, HudGroup.Hotbar, Hotbar: 0),
        new("_ActionBar01", 1, HudGroup.Hotbar, Hotbar: 1),
        new("_ActionBar02", 2, HudGroup.Hotbar, Hotbar: 2),
        new("_ActionBar03", 3, HudGroup.Hotbar, Hotbar: 3),
        new("_ActionBar04", 4, HudGroup.Hotbar, Hotbar: 4),
        new("_ActionBar05", 5, HudGroup.Hotbar, Hotbar: 5),
        new("_ActionBar06", 6, HudGroup.Hotbar, Hotbar: 6),
        new("_ActionBar07", 7, HudGroup.Hotbar, Hotbar: 7),
        new("_ActionBar08", 8, HudGroup.Hotbar, Hotbar: 8),
        new("_ActionBar09", 9, HudGroup.Hotbar, Hotbar: 9),
        new("_ActionBarEx", 10, HudGroup.Hotbar),
        new("_ActionCross", 11, HudGroup.Hotbar),
        new("_ActionDoubleCrossL", 38, HudGroup.Hotbar),
        new("_ActionDoubleCrossR", 39, HudGroup.Hotbar),
        new("_CastBar", 12, HudGroup.Main),
        new("_TargetInfo", 13, HudGroup.Main),
        new("_TargetInfoMainTarget", 72, HudGroup.Main),
        new("_TargetInfoCastBar", 71, HudGroup.Main),
        new("_TargetInfoBuffDebuff", 70, HudGroup.Main),
        new("_FocusTargetInfo", 14, HudGroup.Main),
        new("_PartyList", 15, HudGroup.Main),
        new("_AllianceList1", 30, HudGroup.Main),
        new("_AllianceList2", 31, HudGroup.Main),
        new("_EnemyList", 16, HudGroup.Main),
        new("_ParameterWidget", 17, HudGroup.Main),
        new("_Notification", 18, HudGroup.Main),
        new("_NaviMap", 19, HudGroup.Main),
        new("_MainCommand", 20, HudGroup.Main),
        new("_DTR", 21, HudGroup.Main),
        new("_Money", 22, HudGroup.Main),
        new("_BagWidget", 23, HudGroup.Main),
        new("_ToDoList", 24, HudGroup.Main),
        new("ItemDetail", 25, HudGroup.Main),
        new("ActionDetail", 26, HudGroup.Main),
        new("_LimitBreak", 27, HudGroup.Main),
        new("_Exp", 28, HudGroup.Main),
        new("_Status", 29, HudGroup.Main),
        new("_StatusCustom0", 67, HudGroup.Main),
        new("_StatusCustom1", 68, HudGroup.Main),
        new("_StatusCustom2", 69, HudGroup.Main),
        new("_StatusCustom3", 86, HudGroup.Main),
        new("ScenarioTree", 63, HudGroup.Main),
        new("_ContentGauge", 59, HudGroup.Content),
        new("_ActionContents", 60, HudGroup.Content),
        new("QuestRedoHud", 83, HudGroup.Content),
        new("HWDAetherGauge", 84, HudGroup.Content),
        new("IKDMission", 85, HudGroup.Content),
        new("FGSHudGoal", 99, HudGroup.Content),
        new("FGSHudScore", 100, HudGroup.Content),
        new("FGSHudStatus", 101, HudGroup.Content),
        new("FGSHudRaceLog", 102, HudGroup.Content),
        new("WKSAnnounce", 109, HudGroup.Content),
        new("JobHudPLD0", 40, HudGroup.Gauge, "PLD"),
        new("JobHudMNK0", 91, HudGroup.Gauge, "MNK"),
        new("JobHudMNK1", 61, HudGroup.Gauge, "MNK"),
        new("JobHudWAR0", 42, HudGroup.Gauge, "WAR"),
        new("JobHudDRG0", 43, HudGroup.Gauge, "DRG"),
        new("JobHudBRD0", 44, HudGroup.Gauge, "BRD"),
        new("JobHudWHM0", 45, HudGroup.Gauge, "WHM"),
        new("JobHudBLM0", 46, HudGroup.Gauge, "BLM"),
        new("JobHudBLM1", 103, HudGroup.Gauge, "BLM"),
        new("JobHudACN0", 47, HudGroup.Gauge, "SCH"),
        new("JobHudSMN0", 48, HudGroup.Gauge, "SMN"),
        new("JobHudSMN1", 49, HudGroup.Gauge, "SMN"),
        new("JobHudSCH0", 50, HudGroup.Gauge, "SCH"),
        new("JobHudNIN0", 51, HudGroup.Gauge, "NIN"),
        new("JobHudNIN1v70", 62, HudGroup.Gauge, "NIN"),
        new("JobHudMCH0", 52, HudGroup.Gauge, "MCH"),
        new("JobHudDRK0", 54, HudGroup.Gauge, "DRK"),
        new("JobHudDRK1", 78, HudGroup.Gauge, "DRK"),
        new("JobHudAST0", 55, HudGroup.Gauge, "AST"),
        new("JobHudSAM0", 56, HudGroup.Gauge, "SAM"),
        new("JobHudSAM1", 57, HudGroup.Gauge, "SAM"),
        new("JobHudRDM0", 58, HudGroup.Gauge, "RDM"),
        new("JobHudGNB0", 79, HudGroup.Gauge, "GNB"),
        new("JobHudDNC0", 80, HudGroup.Gauge, "DNC"),
        new("JobHudDNC1", 81, HudGroup.Gauge, "DNC"),
        new("JobHudRRP0", 87, HudGroup.Gauge, "RPR"),
        new("JobHudRRP1", 88, HudGroup.Gauge, "RPR"),
        new("JobHudGFF0", 89, HudGroup.Gauge, "SGE"),
        new("JobHudGFF1", 90, HudGroup.Gauge, "SGE"),
        new("JobHudRDB0", 104, HudGroup.Gauge, "VPR"),
        new("JobHudRDB1", 105, HudGroup.Gauge, "VPR"),
        new("JobHudRPM0", 106, HudGroup.Gauge, "PCT"),
        new("JobHudRPM1", 107, HudGroup.Gauge, "PCT"),
        new("JobHudXBM0", 110, HudGroup.Gauge, "BST"),
        new("JobHudXBM1", 111, HudGroup.Gauge, "BST"),
        new("PvPColosseumHeader", 73, HudGroup.Pvp),
        new("PvPColosseumPartyList0", 74, HudGroup.Pvp),
        new("PvPColosseumPartyList1", 75, HudGroup.Pvp),
        new("PvPMKSHeader", 92, HudGroup.Pvp),
        new("PvPMKSPartyList1", 93, HudGroup.Pvp),
        new("PvPMKSPartyList3", 95, HudGroup.Pvp),
        new("PvPMKSBattleLog", 96, HudGroup.Pvp),
        new("PvPMap", 97, HudGroup.Pvp),
        new("PvPFrontlineHeader", 98, HudGroup.Pvp),
        new("PvPFrontlineGauge", 82, HudGroup.Pvp),
        new("PvPFrontlineInfo", 108, HudGroup.Pvp),
        new("ManeuversHeader", 64, HudGroup.Pvp),
        new("ManeuversAllianceList", 65, HudGroup.Pvp),
        new("ManeuversTeamInfo", 66, HudGroup.Pvp),
        new("ManeuversStation", 76, HudGroup.Pvp),
        new("ManeuversGoblinSoldier", 77, HudGroup.Pvp),
    ];

    private static readonly Dictionary<uint, HudElementInfo> ByHash = All.ToDictionary(e => e.Hash);

    public static HudElementInfo? Find(uint hash) => ByHash.GetValueOrDefault(hash);
}

/// <summary>CRC32 standard (polynôme 0xEDB88320), celui du jeu pour nommer les éléments de l'ATH.</summary>
public static class Crc32
{
    private static readonly uint[] Table = Enumerable.Range(0, 256).Select(n =>
    {
        var c = (uint)n;
        for (var k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
        return c;
    }).ToArray();

    public static uint Of(string text)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var b in System.Text.Encoding.UTF8.GetBytes(text)) crc = Table[(crc ^ b) & 0xFF] ^ (crc >> 8);
        return crc ^ 0xFFFFFFFFu;
    }
}
