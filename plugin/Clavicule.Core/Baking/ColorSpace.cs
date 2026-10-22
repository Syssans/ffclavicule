using System.Numerics;

namespace Clavicule.Baking;

/// <summary>
/// Conversions sRGB ↔ linéaire. Le jeu stocke les couleurs (peau, cheveux, teintures) « au carré »,
/// c'est-à-dire en espace linéaire, alors que les textures de couleur sont en sRGB.
/// </summary>
public static class ColorSpace
{
    private static readonly float[] ToLinearTable = Enumerable.Range(0, 256).Select(i => SrgbToLinear(i / 255f)).ToArray();

    public static float SrgbToLinear(float c) => c <= 0.04045f ? c / 12.92f : MathF.Pow((c + 0.055f) / 1.055f, 2.4f);

    public static float LinearToSrgb(float c)
    {
        c = Math.Clamp(c, 0f, 1f);
        return c <= 0.0031308f ? c * 12.92f : 1.055f * MathF.Pow(c, 1f / 2.4f) - 0.055f;
    }

    public static float ByteToLinear(byte b) => ToLinearTable[b];

    public static byte ToByte(float v) => (byte)Math.Clamp((int)MathF.Round(v * 255f), 0, 255);

    public static byte LinearToByte(float v) => ToByte(LinearToSrgb(v));

    /// <summary>Lit un pixel de texture de couleur (sRGB) en linéaire ; l'alpha reste tel quel (0..1).</summary>
    public static Vector4 ReadColor(Texture t, int x, int y)
    {
        var i = (y * t.Width + x) * 4;
        var p = t.Pixels;
        return new Vector4(ToLinearTable[p[i]], ToLinearTable[p[i + 1]], ToLinearTable[p[i + 2]], p[i + 3] / 255f);
    }

    /// <summary>Lit un pixel de texture de données (normale, masque, index) : valeurs brutes 0..1.</summary>
    public static Vector4 ReadData(Texture t, int x, int y)
    {
        var i = (y * t.Width + x) * 4;
        var p = t.Pixels;
        return new Vector4(p[i] / 255f, p[i + 1] / 255f, p[i + 2] / 255f, p[i + 3] / 255f);
    }

    /// <summary>Écrit une couleur linéaire (convertie en sRGB) et un alpha.</summary>
    public static void WriteColor(Texture t, int x, int y, Vector3 linear, float alpha)
    {
        var i = (y * t.Width + x) * 4;
        var p = t.Pixels;
        p[i] = LinearToByte(linear.X);
        p[i + 1] = LinearToByte(linear.Y);
        p[i + 2] = LinearToByte(linear.Z);
        p[i + 3] = ToByte(alpha);
    }

    public static void WriteData(Texture t, int x, int y, Vector4 value)
    {
        var i = (y * t.Width + x) * 4;
        var p = t.Pixels;
        p[i] = ToByte(value.X);
        p[i + 1] = ToByte(value.Y);
        p[i + 2] = ToByte(value.Z);
        p[i + 3] = ToByte(value.W);
    }
}
