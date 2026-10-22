using Clavicule.Sync;
using Xunit;

namespace Clavicule.Core.Tests;

public class LodestoneSearchTests
{
    private static string Fixture() => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "lodestone-search.html"));

    [Fact]
    public void Trouve_l_identifiant_dans_une_vraie_page_de_recherche()
    {
        Assert.Equal(39451459L, LodestoneSearch.ParseCharacterId(Fixture(), "Six Clavicule"));
        Assert.Equal(39451459L, LodestoneSearch.ParseCharacterId(Fixture(), "six clavicule "));
    }

    [Fact]
    public void Ignore_les_noms_seulement_proches()
    {
        var html = """
            <a href="/lodestone/character/1/" class="entry__link"><div><p class="entry__name">Six Claviculee</p></div></a>
            <a href="/lodestone/character/2/" class="entry__link"><div><p class="entry__name">Six Clavicule</p></div></a>
            """;
        Assert.Equal(2L, LodestoneSearch.ParseCharacterId(html, "Six Clavicule"));
        Assert.Null(LodestoneSearch.ParseCharacterId(html, "Personne"));
    }

    [Fact]
    public void Construit_l_adresse_de_recherche()
    {
        var uri = LodestoneSearch.SearchUri("Six Clavicule", "Moogle");
        Assert.Equal("https://eu.finalfantasyxiv.com/lodestone/character/?q=Six%20Clavicule&worldname=Moogle", uri.AbsoluteUri);
    }
}

/// <summary>
/// Tests de bout en bout contre un service lancé avec « npm run dev » dans server/
/// (clés de server/.dev.vars : écriture « ecriture-anton »). Ignorés si CLAVICULE_SYNC_URL n'est pas défini.
/// </summary>
public class SyncClientTests
{
    private static readonly string? Url = Environment.GetEnvironmentVariable("CLAVICULE_SYNC_URL");

    [Fact]
    public void Complete_l_adresse()
    {
        Assert.Equal("https://a.workers.dev", SyncClient.NormalizeUrl(" a.workers.dev/ "));
        Assert.Equal("http://localhost:8787", SyncClient.NormalizeUrl("http://localhost:8787/"));
    }

    [Fact]
    public async Task Service_injoignable_donne_un_message_clair()
    {
        var client = new SyncClient(new HttpClient { Timeout = TimeSpan.FromSeconds(5) });
        var result = await client.CheckAsync("http://127.0.0.1:9", "x");
        Assert.False(result.Ok);
        Assert.StartsWith("Service injoignable", result.Message);
    }

    [Fact]
    public async Task Envoie_un_modele_au_service_local()
    {
        if (Url == null) return;
        var client = new SyncClient(new HttpClient());
        Assert.True((await client.CheckAsync(Url, "ecriture-anton")).Ok);
        Assert.False((await client.CheckAsync(Url, "mauvaise-cle")).Ok);

        var glb = new byte[64];
        "glTF"u8.CopyTo(glb);
        glb[4] = 2;
        var ok = await client.UploadAsync(Url, "ecriture-anton", 123456, glb, "Test Été", "Moogle", "abc");
        Assert.True(ok.Ok, ok.Message);
        var refused = await client.UploadAsync(Url, "mauvaise-cle", 123456, glb, "Test", "Moogle", "abc");
        Assert.False(refused.Ok);
        Assert.Contains("refusée", refused.Message);
    }
}
