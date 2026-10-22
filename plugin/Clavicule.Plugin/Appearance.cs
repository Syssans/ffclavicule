using System.IO.Hashing;
using System.Runtime.InteropServices;
using Dalamud.Game.ClientState.Conditions;
using Dalamud.Plugin.Services;
using FFXIVClientStructs.FFXIV.Client.Game.Character;

namespace Clavicule.Plugin;

/// <summary>Empreinte de l'apparence et état « au repos » du personnage.</summary>
public static unsafe class Appearance
{
    /// <summary>Visage, corps, équipement, teintures, armes et lunettes : change dès que l'apparence change.</summary>
    public static string Hash(Character* character, bool includeWeapons)
    {
        var hash = new XxHash64();
        ref var draw = ref character->DrawData;
        hash.Append(new ReadOnlySpan<byte>(&character->DrawData.CustomizeData, sizeof(CustomizeData)));
        hash.Append(MemoryMarshal.AsBytes(draw.EquipmentModelIds));
        hash.Append(MemoryMarshal.AsBytes(draw.GlassesIds));
        if (includeWeapons)
        {
            foreach (var weapon in draw.WeaponData)
            {
                var model = weapon.ModelId;
                hash.Append(new ReadOnlySpan<byte>(&model, sizeof(WeaponModelId)));
            }
        }
        Span<byte> flags = [(byte)(draw.IsHatHidden ? 1 : 0), (byte)(draw.IsVisorToggled ? 1 : 0)];
        hash.Append(flags);
        return Convert.ToHexStringLower(hash.GetCurrentHash());
    }

    private static readonly ConditionFlag[] Busy =
    [
        ConditionFlag.Mounted, ConditionFlag.RidingPillion, ConditionFlag.Mounting, ConditionFlag.Mounting71,
        ConditionFlag.InCombat, ConditionFlag.Casting, ConditionFlag.Casting87, ConditionFlag.Emoting,
        ConditionFlag.OccupiedInCutSceneEvent, ConditionFlag.WatchingCutscene, ConditionFlag.WatchingCutscene78,
        ConditionFlag.BetweenAreas, ConditionFlag.BetweenAreas51, ConditionFlag.Jumping, ConditionFlag.Jumping61,
        ConditionFlag.InFlight, ConditionFlag.Swimming, ConditionFlag.Diving, ConditionFlag.Transformed,
        ConditionFlag.Crafting, ConditionFlag.Gathering, ConditionFlag.Fishing, ConditionFlag.Performing,
        ConditionFlag.UsingFashionAccessory, ConditionFlag.Disguised, ConditionFlag.CarryingObject, ConditionFlag.CarryingItem,
        ConditionFlag.LoggingOut, ConditionFlag.CreatingCharacter, ConditionFlag.EditingPortrait,
    ];

    /// <summary>Debout, immobile et sans activité : la pose exportée sera une pose de repos.</summary>
    public static bool IsIdle(Character* character, ICondition condition, IClientState clientState)
    {
        if (clientState.IsGPosing) return false;
        foreach (var flag in Busy)
            if (condition[flag]) return false;
        if (character->Mode != CharacterModes.Normal) return false;
        if (character->IsWeaponDrawn) return false;
        return true;
    }
}
