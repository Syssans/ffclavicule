using System.Net.Http.Json;
using System.Text.Json;
using Clavicule.Private;
using Clavicule.Sync;
using Xunit;

namespace Clavicule.Core.Tests;

public class PrivateSnapshotTests
{
    private static RetainerInfo Retainer(string id, string name, uint gil = 0) =>
        new(id, name, 18, 100, gil, 10, 2, 1, 0, 0, null, null, null, null);

    [Fact]
    public void Additionne_les_piles_identiques()
    {
        var merged = ItemStack.Merge([new(5057, 99, false), new(5057, 20, false), new(5057, 3, true), new(0, 1, false), new(2, 0, false)]);
        Assert.Equal([new ItemStack(5057, 119, false), new ItemStack(5057, 3, true)], merged);
    }

    [Fact]
    public void Garde_l_inventaire_d_un_servant_vu_a_la_sonnette()
    {
        var memory = new PrivateMemory();
        var seen = Retainer("1", "Alpha") with { SeenAt = DateTime.UtcNow, Items = [new(5057, 3, false)] };
        memory.MergeRetainers([Retainer("1", "Alpha"), Retainer("2", "Beta")], seen);

        // Plus tard, loin de la sonnette : la liste change (gil), l'inventaire reste.
        var later = memory.MergeRetainers([Retainer("1", "Alpha", gil: 500), Retainer("2", "Beta")], null);
        Assert.Equal(500u, later[0].Gil);
        Assert.Equal(3, later[0].Items![0].Qty);
        Assert.Null(later[1].Items);

        // Mémoire relue depuis le disque.
        var reloaded = PrivateMemory.FromJson(memory.ToJson());
        Assert.Equal(3, reloaded.Retainers["1"].Items![0].Qty);

        // Servant congédié : oublié.
        memory.MergeRetainers([Retainer("2", "Beta")], null);
        Assert.False(memory.Retainers.ContainsKey("1"));
    }

    [Fact]
    public void L_empreinte_ignore_la_date_mais_suit_le_contenu()
    {
        PrivateSnapshot Make(DateTime at, uint gil) =>
            new(PrivateSnapshot.CurrentSchema, at, "Six Clavicule", "Moogle", gil, new() { ["mgp"] = 10 },
                [new ItemGroup("sacs", "Sacs", at, [new(5057, 1, false)])], [], null);
        var a = Make(DateTime.UtcNow, 100);
        var b = Make(DateTime.UtcNow.AddMinutes(5), 100);
        Assert.Equal(a.ContentHash(), b.ContentHash());
        Assert.NotEqual(a.ContentHash(), Make(DateTime.UtcNow, 101).ContentHash());
        using var doc = JsonDocument.Parse(a.ToJson());
        Assert.Equal(100u, doc.RootElement.GetProperty("gil").GetUInt32());
        Assert.Equal("sacs", doc.RootElement.GetProperty("inventories")[0].GetProperty("key").GetString());
        Assert.False(doc.RootElement.TryGetProperty("mail", out _));
    }
}

public class CollectionSnapshotTests
{
    [Fact]
    public void Collections_et_hauts_faits_dans_le_releve()
    {
        PrivateSnapshot Make(DateTime at, int mounts) =>
            new(PrivateSnapshot.CurrentSchema, at, "Six Clavicule", "Moogle", 0, new(), [], [], null,
                [new CollectionInfo("mounts", "Montures", 356, Enumerable.Range(1, mounts).Select(i => new CollectionEntry((uint)i, $"Monture {i}", 4000u + (uint)i)).ToList())],
                new AchievementSummary(at, 120, 4000, 1450, 37955));
        var a = Make(DateTime.UtcNow, 27);
        Assert.Equal(a.ContentHash(), Make(DateTime.UtcNow.AddHours(1), 27).ContentHash());
        Assert.NotEqual(a.ContentHash(), Make(DateTime.UtcNow, 28).ContentHash());

        using var doc = JsonDocument.Parse(a.ToJson());
        var mounts = doc.RootElement.GetProperty("collections")[0];
        Assert.Equal("mounts", mounts.GetProperty("key").GetString());
        Assert.Equal(356, mounts.GetProperty("total").GetInt32());
        Assert.Equal(27, mounts.GetProperty("owned").GetArrayLength());
        Assert.Equal(1450, doc.RootElement.GetProperty("achievements").GetProperty("points").GetInt32());
    }

    [Fact]
    public void Garde_la_derniere_armoire_vue()
    {
        var memory = new PrivateMemory();
        CollectionInfo Info(string key, int owned) =>
            new(key, key, 10, Enumerable.Range(1, owned).Select(i => new CollectionEntry((uint)i, $"{key} {i}", 0)).ToList());

        // Armoire ouverte à l'auberge : relevée avec le reste.
        var first = memory.MergeCollections([Info("mounts", 3), Info("armoire", 5)])!;
        Assert.Equal(["mounts", "armoire"], first.Select(c => c.Key));

        // Plus tard, loin de l'armoire : elle n'est plus lisible, on garde la dernière version.
        var later = memory.MergeCollections([Info("mounts", 4)])!;
        Assert.Equal(4, later.Single(c => c.Key == "mounts").Owned.Count);
        Assert.Equal(5, later.Single(c => c.Key == "armoire").Owned.Count);
        Assert.Equal(5, PrivateMemory.FromJson(memory.ToJson()).MergeCollections(null)!.Single(c => c.Key == "armoire").Owned.Count);
    }

    [Fact]
    public void Garde_les_derniers_hauts_faits_connus()
    {
        var memory = new PrivateMemory();
        Assert.Null(memory.MergeAchievements(null));
        var seen = new AchievementSummary(DateTime.UtcNow, 10, 4000, 100, 37955);
        Assert.Equal(seen, memory.MergeAchievements(seen));
        Assert.Equal(seen, PrivateMemory.FromJson(memory.ToJson()).MergeAchievements(null));
    }
}

/// <summary>Parcours complet contre un service local (CLAVICULE_SYNC_URL), comme le ferait le téléphone.</summary>
public class PrivateSyncTests
{
    private static readonly string? Url = Environment.GetEnvironmentVariable("CLAVICULE_SYNC_URL");

    [Fact]
    public async Task Le_telephone_associe_lit_les_donnees_envoyees_par_le_plugin()
    {
        if (Url == null) return;
        var http = new HttpClient();
        var client = new SyncClient(http);
        var secret = SyncClient.NewSecret();
        var glb = new byte[64];
        "glTF"u8.CopyTo(glb);
        glb[4] = 2;
        // Identifiant distinct de celui des autres tests (le service local garde les liaisons).
        var id = 111111;
        var first = await client.UploadAsync(Url, secret, id, glb, "", "Moogle", "x");
        if (first.IsClaimedElsewhere) return; // service déjà utilisé par un essai précédent
        Assert.True(first.Ok, first.Message);

        var snapshot = new PrivateSnapshot(1, DateTime.UtcNow, "Six Clavicule", "Moogle", 4242, new(), [], [], null);
        Assert.True((await client.UploadPrivateAsync(Url, secret, id, snapshot.ToJson())).Ok);

        var (code, created) = await client.CreatePairingAsync(Url, secret, id, "Six Clavicule", "Moogle");
        Assert.True(created.Ok, created.Message);
        var paired = await http.PostAsJsonAsync($"{Url}/v1/pair", new { code = code!.Code, device = "Test" });
        var token = (await paired.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();

        using var read = new HttpRequestMessage(HttpMethod.Get, $"{Url}/v1/characters/{id}/private");
        read.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        var data = await (await http.SendAsync(read)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(4242u, data.GetProperty("gil").GetUInt32());

        var (devices, _) = await client.ListDevicesAsync(Url, secret, id);
        Assert.Contains(devices!, d => d.Name == "Test");
        Assert.True((await client.RevokeDeviceAsync(Url, secret, id, devices!.First(d => d.Name == "Test").Id)).Ok);
    }
}
