using Clavicule.Private;
using Dalamud.Game.ClientState.Objects.SubKinds;
using FFXIVClientStructs.FFXIV.Client.Game;
using FFXIVClientStructs.FFXIV.Client.Game.UI;
using FFXIVClientStructs.FFXIV.Client.UI.Info;

namespace Clavicule.Plugin;

/// <summary>Lit dans le jeu l'inventaire, les servants et le courrier (à appeler sur le thread du jeu).</summary>
public static unsafe class PrivateCollector
{
    private static readonly (string Key, string Label, InventoryType[] Types)[] Groups =
    [
        ("sacs", "Sacs", [InventoryType.Inventory1, InventoryType.Inventory2, InventoryType.Inventory3, InventoryType.Inventory4]),
        ("equipement", "Équipement porté", [InventoryType.EquippedItems]),
        ("arsenal", "Arsenal",
        [
            InventoryType.ArmoryMainHand, InventoryType.ArmoryOffHand, InventoryType.ArmoryHead, InventoryType.ArmoryBody,
            InventoryType.ArmoryHands, InventoryType.ArmoryWaist, InventoryType.ArmoryLegs, InventoryType.ArmoryFeets,
            InventoryType.ArmoryEar, InventoryType.ArmoryNeck, InventoryType.ArmoryWrist, InventoryType.ArmoryRings,
            InventoryType.ArmorySoulCrystal,
        ]),
        ("cristaux", "Cristaux", [InventoryType.Crystals]),
        ("sacoche", "Sacoche de chocobo", [InventoryType.SaddleBag1, InventoryType.SaddleBag2]),
        ("sacoche-premium", "Sacoche premium", [InventoryType.PremiumSaddleBag1, InventoryType.PremiumSaddleBag2]),
    ];

    private static readonly InventoryType[] RetainerPages =
    [
        InventoryType.RetainerPage1, InventoryType.RetainerPage2, InventoryType.RetainerPage3, InventoryType.RetainerPage4,
        InventoryType.RetainerPage5, InventoryType.RetainerPage6, InventoryType.RetainerPage7,
    ];

    /// <summary>Objets d'un ensemble de conteneurs ; null si l'un d'eux n'est pas chargé.</summary>
    private static List<ItemStack>? Read(InventoryManager* manager, IEnumerable<InventoryType> types)
    {
        var stacks = new List<ItemStack>();
        foreach (var type in types)
        {
            var container = manager->GetInventoryContainer(type);
            if (container == null || !container->IsLoaded) return null;
            for (var i = 0; i < container->Size; i++)
            {
                var item = container->GetInventorySlot(i);
                if (item == null || item->ItemId == 0) continue;
                stacks.Add(new ItemStack(item->ItemId, item->Quantity, item->IsHighQuality()));
            }
        }
        return ItemStack.Merge(stacks);
    }

    public static PrivateSnapshot? Collect(IPlayerCharacter player, PrivateMemory memory, CollectionCollector collections)
    {
        var manager = InventoryManager.Instance();
        if (manager == null) return null;
        var now = DateTime.UtcNow;

        var groups = new List<ItemGroup>();
        foreach (var (key, label, types) in Groups)
        {
            var items = Read(manager, types);
            var group = memory.MergeGroup(key, items == null ? null : new ItemGroup(key, label, now, items));
            if (group != null) groups.Add(group);
        }

        var currencies = new Dictionary<string, uint>
        {
            ["mgp"] = manager->GetGoldSaucerCoin(),
            ["wolfMarks"] = manager->GetWolfMarks(),
            ["alliedSeals"] = manager->GetAlliedSeals(),
        };
        var playerState = PlayerState.Instance();
        if (playerState != null && playerState->GrandCompany > 0)
            currencies["companySeals"] = manager->GetCompanySeals(playerState->GrandCompany);

        return new PrivateSnapshot(
            PrivateSnapshot.CurrentSchema,
            now,
            player.Name.TextValue,
            player.HomeWorld.Value.Name.ToString(),
            manager->GetGil(),
            currencies,
            groups,
            CollectRetainers(manager, memory, now),
            CollectMail(memory, now),
            memory.MergeCollections(collections.Collect()),
            memory.MergeAchievements(collections.CollectAchievements(now)));
    }

    private static List<RetainerInfo> CollectRetainers(InventoryManager* manager, PrivateMemory memory, DateTime now)
    {
        var retainers = RetainerManager.Instance();
        if (retainers == null || !retainers->IsReady) return memory.Retainers.Values.ToList();

        var listed = new List<RetainerInfo>();
        for (uint i = 0; i < retainers->GetRetainerCount(); i++)
        {
            var r = retainers->GetRetainerBySortedIndex(i);
            if (r == null || r->RetainerId == 0) continue;
            listed.Add(new RetainerInfo(r->RetainerId.ToString(), r->NameString, r->ClassJob, r->Level, r->Gil, r->ItemCount,
                                        r->MarketItemCount, (int)r->Town, r->VentureId, r->VentureComplete, null, null, null, null));
        }

        // Servant ouvert à la sonnette : son inventaire et ses ventes sont chargés.
        RetainerInfo? opened = null;
        var active = retainers->GetActiveRetainer();
        if (active != null && active->RetainerId != 0)
        {
            var items = Read(manager, RetainerPages);
            if (items != null)
            {
                var id = active->RetainerId.ToString();
                var basic = listed.FirstOrDefault(r => r.Id == id);
                if (basic != null)
                {
                    opened = basic with
                    {
                        SeenAt = now,
                        Items = items,
                        Crystals = Read(manager, [InventoryType.RetainerCrystals]),
                        Market = ReadMarket(manager),
                    };
                }
            }
        }
        return memory.MergeRetainers(listed, opened);
    }

    private static List<MarketListing>? ReadMarket(InventoryManager* manager)
    {
        var container = manager->GetInventoryContainer(InventoryType.RetainerMarket);
        if (container == null || !container->IsLoaded) return null;
        var listings = new List<MarketListing>();
        for (var i = 0; i < container->Size; i++)
        {
            var item = container->GetInventorySlot(i);
            if (item == null || item->ItemId == 0) continue;
            listings.Add(new MarketListing(item->ItemId, item->Quantity, item->IsHighQuality(), manager->GetRetainerMarketPrice((short)i)));
        }
        return listings;
    }

    /// <summary>Le courrier n'est connu qu'après ouverture de la boîte aux lettres ; sinon, dernière version vue.</summary>
    private static Mailbox? CollectMail(PrivateMemory memory, DateTime now)
    {
        var proxy = InfoProxyLetter.Instance();
        if (proxy == null || proxy->EntryCount == 0) return memory.Mail;
        var letters = new List<Letter>();
        foreach (var letter in proxy->Letters)
        {
            if (letter.Timestamp == 0) continue;
            var attachments = new List<ItemStack>();
            foreach (var a in letter.Attachments)
                if (a.ItemId != 0) attachments.Add(new ItemStack(a.ItemId, (int)a.Count, false));
            letters.Add(new Letter(letter.SenderString, letter.Timestamp, letter.MessagePreviewString, letter.Read, letter.Gil,
                                   ItemStack.Merge(attachments)));
        }
        memory.Mail = new Mailbox(now, letters.OrderByDescending(l => l.Timestamp).ToList());
        return memory.Mail;
    }
}
