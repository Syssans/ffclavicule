using Clavicule.Hud;
using Dalamud.Plugin.Services;
using Dalamud.Utility;
using FFXIVClientStructs.FFXIV.Client.Graphics.Kernel;
using FFXIVClientStructs.FFXIV.Client.UI;
using FFXIVClientStructs.FFXIV.Client.UI.Misc;
using FFXIVClientStructs.FFXIV.Component.GUI;
using Lumina.Excel.Sheets;
using SlotType = FFXIVClientStructs.FFXIV.Client.UI.Misc.RaptureHotbarModule.HotbarSlotType;

namespace Clavicule.Plugin;

/// <summary>
/// Lecture et écriture de l'ATH dans la mémoire du jeu : dispositions (AddonConfig) et barres d'actions
/// (RaptureHotbarModule). Tout doit se faire sur le thread du jeu.
/// </summary>
public sealed unsafe class HudGame(IDataManager data)
{
    private readonly Dictionary<(int Type, uint Id), (string Name, uint Icon)> names = new();

    /// <summary>Le jeu est-il en état d'être modifié ? Sinon, la raison.</summary>
    public static string? Busy(ICondition condition)
    {
        var config = AddonConfig.Instance();
        if (config == null || !config->IsLoaded || config->ActiveDataSet == null) return "ATH pas encore chargé";
        var units = RaptureAtkUnitManager.Instance();
        if (units != null && units->IsEditingHudLayout) return "éditeur d'ATH ouvert dans le jeu";
        if (condition[Dalamud.Game.ClientState.Conditions.ConditionFlag.InCombat]) return "en combat";
        if (condition[Dalamud.Game.ClientState.Conditions.ConditionFlag.OccupiedInCutSceneEvent]
            || condition[Dalamud.Game.ClientState.Conditions.ConditionFlag.WatchingCutscene]) return "cinématique";
        return null;
    }

    public HudSnapshot? Collect()
    {
        var config = AddonConfig.Instance();
        if (config == null || !config->IsLoaded || config->ActiveDataSet == null) return null;
        var set = config->ActiveDataSet;
        var entries = set->HudLayoutConfigEntries;
        var layoutCount = set->HudLayoutNames.Length;
        if (layoutCount == 0) return null;
        var perLayout = entries.Length / layoutCount;
        var current = set->CurrentHudLayout;
        var units = RaptureAtkUnitManager.Instance();

        var layouts = new List<HudLayout>();
        for (var l = 0; l < layoutCount; l++)
        {
            var elements = new List<HudElement>();
            for (var i = 0; i < perLayout; i++)
            {
                ref var e = ref entries[l * perLayout + i];
                if (e.AddonNameHash == 0 || HudCatalog.Find(e.AddonNameHash) is not { } info) continue;
                HudRect? live = null;
                if (l == current && units != null)
                {
                    var unit = units->GetAddonByNameHash(e.AddonNameHash);
                    if (unit != null && unit->RootNode != null)
                    {
                        var s = unit->Scale;
                        live = new HudRect(unit->X, unit->Y, unit->RootNode->Width * s, unit->RootNode->Height * s, unit->IsVisible);
                    }
                }
                elements.Add(new HudElement(
                    e.AddonNameHash, info.Addon, HudName(info), info.Group, info.Job, info.Hotbar,
                    e.X, e.Y, e.Scale, e.Width, e.Height, e.ByteValue1,
                    HudEdits.IsVisible(e.ByteValue2), e.Alpha,
                    info.Hotbar != null ? HudEdits.ShapeOf(e.ElementFlags) : null, live));
            }
            var name = set->HudLayoutNames[l].ToString();
            layouts.Add(new HudLayout(l, string.IsNullOrWhiteSpace(name) ? $"Disposition {l + 1}" : name, elements));
        }

        var device = Device.Instance();
        var screen = new HudScreen(device != null ? (int)device->Width : 1920, device != null ? (int)device->Height : 1080,
                                   AtkUnitBase.GetGlobalUIScale());
        return new HudSnapshot(HudSnapshot.CurrentSchema, DateTime.UtcNow, screen, current, layouts, CollectHotbars());
    }

    private string HudName(HudElementInfo info)
    {
        var row = data.GetExcelSheet<Lumina.Excel.Sheets.Hud>().GetRowOrDefault((uint)info.HudRow);
        var name = row?.Unknown0.ExtractText();
        if (string.IsNullOrWhiteSpace(name)) name = info.Addon.TrimStart('_');
        return info.Job != null ? $"{name} ({info.Job})" : name;
    }

    // ---- Barres d'actions ----

    private HotbarSet? CollectHotbars()
    {
        var module = RaptureHotbarModule.Instance();
        if (module == null || !module->ModuleReady) return null;
        var currentJob = (int)module->ActiveHotbarClassJobId;
        var jobs = data.GetExcelSheet<ClassJob>();
        var saved = module->SavedHotbars;

        // Groupe des barres communes à tous les jobs.
        var sharedIndex = -1;
        for (var i = 0; i < saved.Length; i++)
        {
            if (module->GetClassJobIdForSavedHotbarIndex(i) == 0) { sharedIndex = i; break; }
        }

        var list = new List<HotbarJob>();
        var seen = new HashSet<uint>();
        for (var i = 0; i < saved.Length; i++)
        {
            var classJob = module->GetClassJobIdForSavedHotbarIndex(i);
            if (classJob == 0 || !seen.Add(classJob)) continue;
            if (module->GetPvPSavedHotbarIndexForClassJobId(classJob, true) == i) continue;
            if (jobs.GetRowOrDefault(classJob) is not { } row) continue;

            var bars = new List<HotbarBar>();
            for (var bar = 0; bar < HotbarEdits.Bars; bar++)
            {
                var shared = module->IsHotbarShared((uint)bar);
                var slots = new List<HotbarSlotInfo>();
                for (var slot = 0; slot < HotbarEdits.SlotsPerBar; slot++)
                {
                    SlotType type;
                    uint id;
                    if (classJob == currentJob)
                    {
                        // Job en cours : ce qui est affiché.
                        var live = module->GetSlotById((uint)bar, (uint)slot);
                        if (live == null) continue;
                        (type, id) = (live->CommandType, live->CommandId);
                    }
                    else
                    {
                        var group = shared && sharedIndex >= 0 ? sharedIndex : i;
                        var s = saved[group].Hotbars[bar].Slots[slot];
                        (type, id) = (s.CommandType, s.CommandId);
                    }
                    if (type == SlotType.Empty) continue;
                    var (name, icon) = Describe((int)type, id);
                    slots.Add(new HotbarSlotInfo(slot, (int)type, id, name, icon));
                }
                bars.Add(new HotbarBar(bar, shared, slots));
            }
            if (bars.All(b => b.Slots.Count == 0)) continue;
            list.Add(new HotbarJob((int)classJob, row.Abbreviation.ExtractText(), row.Name.ExtractText(), bars));
        }
        // Job en cours d'abord, puis l'ordre du jeu.
        return new HotbarSet(currentJob, list.OrderByDescending(j => j.Job == currentJob).ThenBy(j => j.Job).ToList());
    }

    /// <summary>Nom et icône d'une commande de barre, d'après les données du jeu (pas de fonction du jeu appelée).</summary>
    private (string Name, uint Icon) Describe(int type, uint id)
    {
        if (names.TryGetValue((type, id), out var known)) return known;
        (string Name, uint Icon)? found = (SlotType)type switch
        {
            SlotType.Action => data.GetExcelSheet<Lumina.Excel.Sheets.Action>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), r.Icon) : null,
            SlotType.Item or SlotType.InventoryItem => ItemName(id),
            SlotType.EventItem or SlotType.KeyItem => data.GetExcelSheet<EventItem>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), r.Icon) : null,
            SlotType.Emote => data.GetExcelSheet<Emote>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), r.Icon) : null,
            SlotType.CraftAction => data.GetExcelSheet<CraftAction>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), r.Icon) : null,
            SlotType.GeneralAction => data.GetExcelSheet<GeneralAction>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), (uint)r.Icon) : null,
            SlotType.BuddyAction => data.GetExcelSheet<BuddyAction>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), (uint)r.Icon) : null,
            SlotType.MainCommand => data.GetExcelSheet<MainCommand>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), (uint)r.Icon) : null,
            SlotType.Companion => data.GetExcelSheet<Companion>().GetRowOrDefault(id) is { } r ? (r.Singular.ExtractText(), r.Icon) : null,
            SlotType.PetAction => data.GetExcelSheet<PetAction>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), (uint)r.Icon) : null,
            SlotType.Mount => data.GetExcelSheet<Mount>().GetRowOrDefault(id) is { } r ? (r.Singular.ExtractText(), r.Icon) : null,
            SlotType.FieldMarker => data.GetExcelSheet<FieldMarker>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), r.UiIcon) : null,
            SlotType.Marker => data.GetExcelSheet<Marker>().GetRowOrDefault(id) is { } r ? (r.Name.ExtractText(), (uint)r.Icon) : null,
            SlotType.Macro => ("Macro", 0),
            SlotType.GearSet => ($"Équipement {id + 1}", 0),
            _ => null,
        };
        var result = found is { Name.Length: > 0 } f ? f : ($"{(SlotType)type} {id}", 0u);
        names[(type, id)] = result;
        return result;
    }

    private (string, uint)? ItemName(uint id)
    {
        var hq = id > 1_000_000;
        var item = data.GetExcelSheet<Item>().GetRowOrDefault(hq ? id - 1_000_000 : id);
        return item is { } r ? (r.Name.ExtractText() + (hq ? " (HQ)" : ""), r.Icon) : null;
    }

    // ---- Écriture ----

    /// <summary>Applique une modification de disposition. Rend (éléments réglés, refus).</summary>
    public (int Done, List<string> Refused) ApplyLayout(int layout, IReadOnlyList<HudElementChange> changes)
    {
        var refused = new List<string>();
        var config = AddonConfig.Instance();
        var set = config->ActiveDataSet;
        var entries = set->HudLayoutConfigEntries;
        var layoutCount = set->HudLayoutNames.Length;
        if (layout < 0 || layout >= layoutCount) return (0, ["disposition inconnue"]);
        var perLayout = entries.Length / layoutCount;

        var done = 0;
        foreach (var change in changes)
        {
            if (HudCatalog.Find(change.Hash) is not { } info)
            {
                refused.Add($"élément inconnu ({change.Hash:X8})");
                continue;
            }
            var index = -1;
            for (var i = 0; i < perLayout; i++)
            {
                if (entries[layout * perLayout + i].AddonNameHash == change.Hash) { index = layout * perLayout + i; break; }
            }
            if (index < 0)
            {
                refused.Add($"{info.Addon} absent de la disposition");
                continue;
            }
            ref var e = ref entries[index];
            var entry = new HudEntry
            {
                Hash = e.AddonNameHash, X = e.X, Y = e.Y, Scale = e.Scale, Options = e.ElementFlags, Width = e.Width, Height = e.Height,
                Anchor = e.ByteValue1, Visibility = e.ByteValue2, Alpha = e.Alpha,
            };
            if (HudEdits.Apply(ref entry, change, info) is { } why) refused.Add($"{HudName(info)} : {why}");
            e.X = entry.X;
            e.Y = entry.Y;
            e.Scale = entry.Scale;
            e.ElementFlags = entry.Options;
            e.Width = entry.Width;
            e.Height = entry.Height;
            e.ByteValue2 = entry.Visibility;
            e.Alpha = entry.Alpha;
            done++;
        }

        if (done > 0)
        {
            // La disposition affichée se recharge depuis ces valeurs ; les autres le feront quand on les choisira.
            if (layout == set->CurrentHudLayout) config->ApplyHudLayout();
            config->HasChanges = true;
            config->SaveFile(true);
        }
        return (done, refused);
    }

    public bool Activate(int layout)
    {
        var config = AddonConfig.Instance();
        if (layout < 0 || layout >= config->ActiveDataSet->HudLayoutNames.Length) return false;
        if (config->ActiveDataSet->CurrentHudLayout != layout) config->ChangeHudLayout((uint)layout, false, true);
        return true;
    }

    /// <summary>Réorganise les barres d'un job. Rend (cases changées, refusées).</summary>
    public (int Done, int Refused) ApplyHotbars(int classJob, IReadOnlyList<HotbarSlotChange> changes)
    {
        var module = RaptureHotbarModule.Instance();
        if (module == null || !module->ModuleReady) return (0, changes.Count);
        var job = CollectHotbars()?.Jobs.FirstOrDefault(j => j.Job == classJob);
        if (job == null) return (0, changes.Count);
        var (accepted, refused) = HotbarEdits.Validate(job, changes);

        var current = classJob == module->ActiveHotbarClassJobId;
        foreach (var c in accepted)
        {
            var type = (SlotType)c.Type;
            if (current)
            {
                // Case affichée et sauvegarde du job (ou des barres communes) en une fois.
                module->SetAndSaveSlot((uint)c.Bar, (uint)c.Slot, type, c.Id, false, false);
            }
            else
            {
                var scratch = &module->ScratchSlot;
                if (type == SlotType.Empty) scratch->Clear();
                else scratch->Set(type, c.Id);
                module->WriteSavedSlot((uint)classJob, (uint)c.Bar, (uint)c.Slot, scratch, false, false);
            }
        }
        if (accepted.Count > 0)
        {
            module->HasChanges = true;
            module->SaveFile(true);
        }
        return (accepted.Count, refused);
    }
}
