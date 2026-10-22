using SkiaSharp;

namespace Clavicule.Baking;

/// <summary>Image RGBA 8 bits non prémultipliée, manipulable pixel par pixel.</summary>
public sealed class Texture
{
    public int Width { get; }
    public int Height { get; }
    /// <summary>Octets R, G, B, A ligne par ligne.</summary>
    public byte[] Pixels { get; }

    public Texture(int width, int height, byte[]? pixels = null)
    {
        Width = width;
        Height = height;
        Pixels = pixels ?? new byte[width * height * 4];
        if (Pixels.Length != width * height * 4) throw new ArgumentException("Taille de tampon incorrecte.", nameof(pixels));
    }

    /// <summary>
    /// Décode sans prémultiplier l'alpha : les textures du jeu rangent des données dans l'alpha,
    /// et un pixel d'alpha nul doit garder ses canaux rouge, vert et bleu.
    /// </summary>
    public static Texture Decode(byte[] encoded)
    {
        using var data = SKData.CreateCopy(encoded);
        using var codec = SKCodec.Create(data) ?? throw new InvalidDataException("Image illisible.");
        var info = new SKImageInfo(codec.Info.Width, codec.Info.Height, SKColorType.Rgba8888, SKAlphaType.Unpremul);
        var pixels = new byte[info.BytesSize];
        var handle = System.Runtime.InteropServices.GCHandle.Alloc(pixels, System.Runtime.InteropServices.GCHandleType.Pinned);
        try
        {
            var result = codec.GetPixels(info, handle.AddrOfPinnedObject());
            if (result is not (SKCodecResult.Success or SKCodecResult.IncompleteInput))
                throw new InvalidDataException($"Image illisible ({result}).");
        }
        finally
        {
            handle.Free();
        }
        return new Texture(info.Width, info.Height, pixels);
    }

    public static Texture Load(string path) => Decode(File.ReadAllBytes(path));

    private SKBitmap ToBitmap()
    {
        var info = new SKImageInfo(Width, Height, SKColorType.Rgba8888, SKAlphaType.Unpremul);
        var bitmap = new SKBitmap(info);
        System.Runtime.InteropServices.Marshal.Copy(Pixels, 0, bitmap.GetPixels(), Pixels.Length);
        return bitmap;
    }

    /// <summary>
    /// Redimensionne en moyennant la zone couverte par chaque pixel (canal par canal, alpha compris),
    /// sans prémultiplication. Renvoie la même instance si la taille ne change pas.
    /// </summary>
    public Texture Resize(int width, int height)
    {
        if (width == Width && height == Height) return this;
        var output = new Texture(width, height);
        var sx = (double)Width / width;
        var sy = (double)Height / height;
        var src = Pixels;
        var dst = output.Pixels;
        var srcWidth = Width;
        var srcHeight = Height;
        Parallel.For(0, height, y =>
        {
            var y0 = Math.Min((int)(y * sy), srcHeight - 1);
            var y1 = Math.Clamp((int)Math.Ceiling((y + 1) * sy), y0 + 1, srcHeight);
            for (var x = 0; x < width; x++)
            {
                var x0 = Math.Min((int)(x * sx), srcWidth - 1);
                var x1 = Math.Clamp((int)Math.Ceiling((x + 1) * sx), x0 + 1, srcWidth);
                int r = 0, g = 0, b = 0, a = 0, count = 0;
                for (var yy = y0; yy < y1; yy++)
                for (var xx = x0; xx < x1; xx++)
                {
                    var i = (yy * srcWidth + xx) * 4;
                    r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3];
                    count++;
                }
                var o = (y * width + x) * 4;
                dst[o] = (byte)((r + count / 2) / count);
                dst[o + 1] = (byte)((g + count / 2) / count);
                dst[o + 2] = (byte)((b + count / 2) / count);
                dst[o + 3] = (byte)((a + count / 2) / count);
            }
        });
        return output;
    }

    /// <summary>Réduit l'image pour que son plus grand côté ne dépasse pas <paramref name="maxSize"/>.</summary>
    public Texture Limit(int maxSize)
    {
        var largest = Math.Max(Width, Height);
        if (largest <= maxSize) return this;
        var scale = (double)maxSize / largest;
        return Resize(Math.Max(1, (int)Math.Round(Width * scale)), Math.Max(1, (int)Math.Round(Height * scale)));
    }

    public bool HasTransparency()
    {
        for (var i = 3; i < Pixels.Length; i += 4)
            if (Pixels[i] < 255) return true;
        return false;
    }

    public byte[] EncodePng() => Encode(SKEncodedImageFormat.Png, 100);

    public byte[] EncodeJpeg(int quality = 88) => Encode(SKEncodedImageFormat.Jpeg, quality);

    private byte[] Encode(SKEncodedImageFormat format, int quality)
    {
        using var bitmap = ToBitmap();
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, quality) ?? throw new InvalidOperationException($"Encodage {format} impossible.");
        return data.ToArray();
    }

    /// <summary>Exécute <paramref name="pixel"/> pour chaque pixel, en parallèle par lignes.</summary>
    public static void ForEach(int width, int height, Action<int, int> pixel)
    {
        Parallel.For(0, height, y =>
        {
            for (var x = 0; x < width; x++) pixel(x, y);
        });
    }
}
