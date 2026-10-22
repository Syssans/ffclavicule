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
/// Tests de bout en bout contre un service neuf lancé avec « npx wrangler dev --persist-to $(mktemp -d) » dans server/.
/// Ignorés si CLAVICULE_SYNC_URL n'est pas défini.
/// </summary>
public class SyncClientTests
{
    private static readonly string? Url = Environment.GetEnvironmentVariable("CLAVICULE_SYNC_URL");

    [Fact]
    public void Complete_l_adresse_et_genere_des_secrets_uniques()
    {
        Assert.Equal("https://a.workers.dev", SyncClient.NormalizeUrl(" a.workers.dev/ "));
        Assert.Equal("http://localhost:8787", SyncClient.NormalizeUrl("http://localhost:8787/"));
        var secret = SyncClient.NewSecret();
        Assert.Equal(43, secret.Length);
        Assert.DoesNotContain('+', secret);
        Assert.NotEqual(secret, SyncClient.NewSecret());
    }

    [Fact]
    public async Task Service_injoignable_donne_un_message_clair()
    {
        var client = new SyncClient(new HttpClient { Timeout = TimeSpan.FromSeconds(5) });
        var result = await client.CheckAsync("http://127.0.0.1:9");
        Assert.False(result.Ok);
        Assert.StartsWith("Service injoignable", result.Message);
    }

    [Fact]
    public async Task Premier_envoi_lie_le_personnage_puis_un_autre_PC_doit_le_confirmer()
    {
        if (Url == null) return;
        var client = new SyncClient(new HttpClient());
        Assert.True((await client.CheckAsync(Url)).Ok);

        var glb = new byte[64];
        "glTF"u8.CopyTo(glb);
        glb[4] = 2;
        var pc1 = SyncClient.NewSecret();
        var pc2 = SyncClient.NewSecret();

        var first = await client.UploadAsync(Url, pc1, 39451459, glb, "Six Clavicule", "Moogle", "abc");
        Assert.True(first.Ok, first.Message);

        var other = await client.UploadAsync(Url, pc2, 39451459, glb, "Six Clavicule", "Moogle", "abc");
        Assert.False(other.Ok);
        Assert.True(other.IsClaimedElsewhere, other.Code);

        var (challenge, started) = await client.StartClaimAsync(Url, pc2, 39451459);
        Assert.True(started.Ok, started.Message);
        Assert.StartsWith("CLAVICULE-", challenge!.Code);
        Assert.Contains("/lodestone/character/39451459/", challenge.ProfileUrl);

        // Le code n'est pas dans la présentation : refus avec un message clair.
        var verify = await client.VerifyClaimAsync(Url, pc2, 39451459);
        Assert.False(verify.Ok);
        Assert.Contains(verify.Code, new[] { "code-not-found", "lodestone-down" });

        Assert.False((await client.DeleteAsync(Url, pc2, 39451459)).Ok);
        Assert.True((await client.DeleteAsync(Url, pc1, 39451459)).Ok);
    }
}
