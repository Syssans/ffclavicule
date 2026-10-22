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
