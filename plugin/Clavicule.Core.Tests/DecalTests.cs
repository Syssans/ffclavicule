using System.Numerics;
using System.Text.Json.Nodes;
using Clavicule.Baking;
using Xunit;
using Texture = Clavicule.Baking.Texture;

namespace Clavicule.Core.Tests;

public class DecalTests
{
    private static Texture Solid(int size, byte r, byte g, byte b, byte a)
    {
        var t = new Texture(size, size);
        for (var i = 0; i < t.Pixels.Length; i += 4)
        {
            t.Pixels[i] = r; t.Pixels[i + 1] = g; t.Pixels[i + 2] = b; t.Pixels[i + 3] = a;
        }
        return t;
    }

    /// <summary>Deux triangles couvrant toute la texture, avec UV1 = UV0 × échelle + décalage.</summary>
    private static UvTriangle[] Quad(float scale = 1, float shift = 0)
    {
        Vector2 P(float x, float y) => new(x, y);
        Vector2 Q(float x, float y) => new(x * scale + shift, y * scale + shift);
        return
        [
            new UvTriangle(P(0, 0), P(1, 0), P(1, 1), Q(0, 0), Q(1, 0), Q(1, 1)),
            new UvTriangle(P(0, 0), P(1, 1), P(0, 1), Q(0, 0), Q(1, 1), Q(0, 1)),
        ];
    }

    [Fact]
    public void Peint_la_couleur_choisie_la_ou_le_masque_gris_est_blanc()
    {
        var face = Solid(8, 200, 160, 140, 255);
        // Masque en niveaux de gris (alpha plein) : moitié gauche peinte.
        var decal = Solid(8, 0, 0, 0, 255);
        for (var y = 0; y < 8; y++)
        for (var x = 0; x < 4; x++)
        {
            var i = (y * 8 + x) * 4;
            decal.Pixels[i] = decal.Pixels[i + 1] = decal.Pixels[i + 2] = 255;
        }
        var red = new Vector3(0.5f, 0, 0);
        var painted = DecalBaker.Apply(face, Quad(), decal, new DecalSettings(red, 1f, false, 1f, 0f));
        Assert.True(painted > 0);
        Assert.Equal(ColorSpace.LinearToByte(0.5f), face.Pixels[(4 * 8 + 1) * 4]);
        Assert.Equal(0, face.Pixels[(4 * 8 + 1) * 4 + 1]);
        // Moitié droite intacte.
        Assert.Equal(new byte[] { 200, 160, 140, 255 }, face.Pixels[((4 * 8 + 6) * 4)..((4 * 8 + 6) * 4 + 4)]);
    }

    [Fact]
    public void Ne_peint_rien_hors_de_l_image_de_peinture()
    {
        var face = Solid(8, 200, 160, 140, 255);
        var decal = Solid(8, 255, 255, 255, 255);
        // UV1 entièrement hors de [0, 1] : la peinture ne se répète pas.
        var painted = DecalBaker.Apply(face, Quad(1, 2), decal, new DecalSettings(Vector3.Zero, 1f, false, 1f, 0f));
        Assert.Equal(0, painted);
    }

    [Fact]
    public void Lit_les_reglages_et_ignore_la_peinture_transparente()
    {
        var props = new JsonObject
        {
            ["ShaderPackage"] = "skin.shpk",
            ["DecalPath"] = "chara/common/texture/decal_face/_decal_26.tex",
            ["DecalColor"] = new JsonArray(0.25f, 0.02f, 0f, 0.73f),
            ["GetDecalColor"] = "GetDecalColorAlpha",
            ["FacePaintUVMultiplier"] = -1f,
            ["FacePaintUVOffset"] = 1f,
        };
        var s = DecalSettings.From(new MaterialData(props, "."))!;
        Assert.False(s.UseOwnColors);
        Assert.Equal(0.73f, s.Strength, 3);
        Assert.Equal(-1f, s.UvMultiplier);
        props["DecalPath"] = "chara/common/texture/transparent.tex";
        Assert.Null(DecalSettings.From(new MaterialData(props, ".")));
    }
}
