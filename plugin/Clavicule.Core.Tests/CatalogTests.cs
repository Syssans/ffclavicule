using System.Text.Json;
using Clavicule.Collections;
using Xunit;

namespace Clavicule.Core.Tests;

public class CatalogTests
{
    [Theory]
    [InlineData(25u, SourceType.Pvp)]
    [InlineData(29u, SourceType.GoldSaucer)]
    [InlineData(26533u, SourceType.Hunts)]
    [InlineData(28063u, SourceType.Skybuilders)]
    [InlineData(1u, SourceType.Purchase)]
    public void Le_paiement_dit_d_ou_vient_l_objet(uint currency, string type) => Assert.Equal(type, SourceRules.ForCurrency(currency));

    [Fact]
    public void Textes_en_francais()
    {
        Assert.Equal("Fabriqué par un orfèvre", SourceRules.CraftedBy(3));
        Assert.Equal("Fabriqué par un artisan", SourceRules.CraftedBy(42));
        Assert.Equal("12 000 gils", SourceRules.Price(12000, "gils"));
        Assert.Equal("1 500 sceaux de compagnie", SourceRules.Seals(1500));
        Assert.Equal((SourceType.Event, true), SourceRules.ForOrchestrionCategory(7));
        Assert.Equal((SourceType.Raid, false), SourceRules.ForOrchestrionCategory(10));
        Assert.Equal(25200u, SourceRules.ScripItem(3));
    }

    [Fact]
    public void Pas_de_doublon_ni_de_liste_sans_fin()
    {
        var sources = new List<CatalogSource>();
        for (var i = 0; i < 10; i++) SourceRules.Add(sources, new CatalogSource(SourceType.Purchase, $"{i} gils"));
        SourceRules.Add(sources, new CatalogSource(SourceType.Purchase, "0 gils"));
        SourceRules.Add(sources, new CatalogSource(SourceType.Quest, " "));
        Assert.Equal(5, sources.Count);
    }

    [Fact]
    public void L_empreinte_ignore_la_date_de_construction()
    {
        CollectionCatalog Make(DateTime at, string name) => new(CollectionCatalog.CurrentSchema, at, "2026.10.01",
            [new CatalogCollection("mounts", "Montures", [new CatalogEntry(1, name, 4001, 2000, true, [new CatalogSource(SourceType.Quest, "Mon chocobo")])])]);
        Assert.Equal(Make(DateTime.UtcNow, "Chocobo").ContentHash(), Make(DateTime.UtcNow.AddDays(1), "Chocobo").ContentHash());
        Assert.NotEqual(Make(DateTime.UtcNow, "Chocobo").ContentHash(), Make(DateTime.UtcNow, "Licorne").ContentHash());
        using var doc = JsonDocument.Parse(Make(DateTime.UtcNow, "Chocobo").ToJson());
        var entry = doc.RootElement.GetProperty("collections")[0].GetProperty("items")[0];
        Assert.Equal("quest", entry.GetProperty("sources")[0].GetProperty("type").GetString());
        Assert.True(entry.GetProperty("tradeable").GetBoolean());
    }
}
