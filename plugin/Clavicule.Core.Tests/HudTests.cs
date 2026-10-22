using System.Net.Http.Json;
using System.Text.Json;
using Clavicule.Hud;
using Clavicule.Sync;
using Xunit;

namespace Clavicule.Core.Tests;

public class HudCatalogTests
{
    [Fact]
    public void Les_identifiants_sont_ceux_du_jeu()
    {
        // Valeurs relevées dans la mémoire du jeu (CRC32 de « {addon}_a »).
        Assert.Equal(0xC48D3605u, Crc32.Of("_ActionBar_a"));
        Assert.Equal(0x3D425039u, HudCatalog.All.Single(e => e.Addon == "_PartyList").Hash);
        Assert.Equal(0xCE06BF94u, HudCatalog.All.Single(e => e.Addon == "PvPFrontlineInfo").Hash);
        Assert.Equal("_NaviMap", HudCatalog.Find(0x7159021B)!.Addon);
    }

    [Fact]
    public void Chaque_element_est_unique()
    {
        Assert.Equal(HudCatalog.All.Count, HudCatalog.All.Select(e => e.Hash).Distinct().Count());
        Assert.Equal(HudCatalog.All.Count, HudCatalog.All.Select(e => e.HudRow).Distinct().Count());
        Assert.Equal(Enumerable.Range(0, 10), HudCatalog.All.Where(e => e.Hotbar != null).Select(e => e.Hotbar!.Value).Order());
    }
}

public class HudEditTests
{
    private static readonly HudElementInfo Party = HudCatalog.All.Single(e => e.Addon == "_PartyList");
    private static readonly HudElementInfo Bar2 = HudCatalog.All.Single(e => e.Addon == "_ActionBar01");
    private static readonly HudElementInfo Gauge = HudCatalog.All.Single(e => e.Addon == "JobHudWAR0");

    private static HudEntry Entry() => new()
    {
        Hash = Party.Hash, X = 10, Y = 20, Scale = 1, Options = 0x0000_0101, Width = 624, Height = 72, Anchor = 0, Visibility = 3, Alpha = 255,
    };

    [Fact]
    public void Deplace_et_garde_l_element_a_l_ecran()
    {
        var entry = Entry();
        Assert.Null(HudEdits.Apply(ref entry, new HudElementChange(Party.Hash, X: 55.5f, Y: 140f), Party));
        Assert.Equal(55.5f, entry.X);
        Assert.Equal(100f, entry.Y);
        Assert.NotNull(HudEdits.Apply(ref entry, new HudElementChange(Party.Hash, X: float.NaN), Party));
        Assert.Equal(55.5f, entry.X);
    }

    [Fact]
    public void Taille_aux_valeurs_du_jeu_et_masquage()
    {
        var entry = Entry();
        HudEdits.Apply(ref entry, new HudElementChange(Party.Hash, Scale: 1.33f, Visible: false, Opacity: 0), Party);
        Assert.Equal(1.4f, entry.Scale);
        Assert.False(HudEdits.IsVisible(entry.Visibility));
        Assert.Equal(1, entry.Alpha);
        HudEdits.Apply(ref entry, new HudElementChange(Party.Hash, Visible: true), Party);
        Assert.Equal(3, entry.Visibility);
    }

    [Fact]
    public void Forme_seulement_pour_les_barres_d_actions()
    {
        var entry = Entry();
        Assert.NotNull(HudEdits.Apply(ref entry, new HudElementChange(Party.Hash, Shape: 2), Party));
        Assert.Equal(0x0101u, entry.Options);

        Assert.Null(HudEdits.Apply(ref entry, new HudElementChange(Bar2.Hash, Shape: 2), Bar2));
        Assert.Equal(2, HudEdits.ShapeOf(entry.Options));
        Assert.Equal(0x01u, entry.Options & 0xFF); // l'octet du numéro de barre ne bouge pas
        Assert.Equal((331, 121), ((int)entry.Width, (int)entry.Height));
        Assert.NotNull(HudEdits.Apply(ref entry, new HudElementChange(Bar2.Hash, Shape: 9), Bar2));

        Assert.NotNull(HudEdits.Apply(ref entry, new HudElementChange(Gauge.Hash, Opacity: 100), Gauge));
    }
}

public class HotbarEditTests
{
    private static readonly HotbarJob Warrior = new(21, "WAR", "guerrier",
    [
        new HotbarBar(0, false, [new(0, 1, 31, "Fendoir lourd", 260), new(1, 1, 37, "Mutilation", 255)]),
        new HotbarBar(1, true, [new(0, 5, 9, "Sprint", 104)]),
    ]);

    [Fact]
    public void Accepte_les_echanges_et_les_cases_videes()
    {
        var (accepted, rejected) = HotbarEdits.Validate(Warrior,
        [
            new(0, 0, 1, 37), new(0, 1, 1, 31), // échange
            new(1, 0, 0, 1234), // case vidée
        ]);
        Assert.Equal(0, rejected);
        Assert.Equal([new HotbarSlotChange(0, 0, 1, 37), new HotbarSlotChange(0, 1, 1, 31), new HotbarSlotChange(1, 0, 0, 0)], accepted);
    }

    [Fact]
    public void Refuse_ce_que_le_joueur_n_avait_pas_place()
    {
        var (accepted, rejected) = HotbarEdits.Validate(Warrior,
        [
            new(0, 0, 1, 7400), // action absente des barres
            new(10, 0, 1, 31), // barre hors limites
            new(0, 12, 1, 31), // case hors limites
            new(2, 3, 5, 9), // objet présent ailleurs : accepté
        ]);
        Assert.Equal(3, rejected);
        Assert.Equal([new HotbarSlotChange(2, 3, 5, 9)], accepted);
    }
}

public class HudSnapshotTests
{
    private static HudSnapshot Make(DateTime at, float x, HudRect? live) => new(
        HudSnapshot.CurrentSchema, at, new HudScreen(2560, 1440, 1f), 0,
        [new HudLayout(0, "Disposition 1", [new HudElement(1, "_PartyList", "Liste de l'équipe", HudGroup.Main, null, null, x, 30, 1, 200, 400, 0, true, 255, null, live)])],
        null);

    [Fact]
    public void L_empreinte_ignore_la_date_et_l_affichage_du_moment()
    {
        var a = Make(DateTime.UtcNow, 10, new HudRect(1, 2, 3, 4, true));
        var b = Make(DateTime.UtcNow.AddMinutes(1), 10, null);
        Assert.Equal(a.ContentHash(), b.ContentHash());
        Assert.NotEqual(a.ContentHash(), Make(DateTime.UtcNow, 11, null).ContentHash());
        using var doc = JsonDocument.Parse(a.ToJson());
        Assert.Equal("_PartyList", doc.RootElement.GetProperty("layouts")[0].GetProperty("elements")[0].GetProperty("addon").GetString());
    }

    [Fact]
    public void Lit_la_file_du_service()
    {
        const string json = """
        {"changes":[
          {"id":"a1","kind":"layout","status":"pending","createdAt":"2026-10-22T10:00:00.000Z","device":"iPhone",
           "change":{"kind":"layout","layout":1,"elements":[{"hash":3297588741,"x":50,"y":90.5,"visible":false}]}},
          {"id":"b2","kind":"hotbars","status":"pending","createdAt":"2026-10-22T10:01:00.000Z","device":"iPhone",
           "change":{"kind":"hotbars","job":21,"slots":[{"bar":0,"slot":3,"type":1,"id":31}]}},
          {"id":"c3","kind":"layout","status":"pending","createdAt":"2026-10-22T10:02:00.000Z","device":"iPhone",
           "change":{"kind":"layout","elements":"pas une liste"}}
        ]}
        """;
        var list = QueuedHudChange.ParseList(json);
        Assert.Equal(3, list.Count);
        Assert.Equal(1, list[0].Change.Layout);
        Assert.Equal(new HudElementChange(3297588741, X: 50, Y: 90.5f, Visible: false), list[0].Change.Elements![0]);
        Assert.Equal(new HotbarSlotChange(0, 3, 1, 31), list[1].Change.Slots![0]);
        Assert.Equal("?", list[2].Change.Kind); // illisible : sera refusée
    }
}

/// <summary>Parcours complet contre un service local (CLAVICULE_SYNC_URL) : l'appli dépose, le plugin applique.</summary>
public class HudSyncTests
{
    private static readonly string? Url = Environment.GetEnvironmentVariable("CLAVICULE_SYNC_URL");

    [Fact]
    public async Task Le_plugin_recoit_les_modifications_du_telephone()
    {
        if (Url == null) return;
        var http = new HttpClient();
        var client = new SyncClient(http);
        var secret = SyncClient.NewSecret();
        var glb = new byte[64];
        "glTF"u8.CopyTo(glb);
        glb[4] = 2;
        var id = 222222;
        var first = await client.UploadAsync(Url, secret, id, glb, "", "Moogle", "x");
        if (first.IsClaimedElsewhere) return;
        Assert.True(first.Ok, first.Message);

        var snapshot = new HudSnapshot(1, DateTime.UtcNow, new HudScreen(1920, 1080, 1), 0, [], null);
        Assert.True((await client.UploadHudAsync(Url, secret, id, snapshot.ToJson())).Ok);

        var (code, _) = await client.CreatePairingAsync(Url, secret, id, "Six", "Moogle");
        var paired = await http.PostAsJsonAsync($"{Url}/v1/pair", new { code = code!.Code, device = "Test" });
        var token = (await paired.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        using var post = new HttpRequestMessage(HttpMethod.Post, $"{Url}/v1/characters/{id}/hud/changes")
        {
            Content = JsonContent.Create(new { kind = "activate", layout = 2 }),
        };
        post.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        Assert.True((await http.SendAsync(post)).IsSuccessStatusCode);

        var (pending, result) = await client.PendingHudChangesAsync(Url, secret, id);
        Assert.True(result.Ok, result.Message);
        var change = Assert.Single(pending!);
        Assert.Equal(2, change.Change.Layout);
        Assert.True((await client.FinishHudChangeAsync(Url, secret, id, change.Id, "applied", "Disposition 3 activée.")).Ok);
        var (after, _) = await client.PendingHudChangesAsync(Url, secret, id);
        Assert.Empty(after!);
    }
}
