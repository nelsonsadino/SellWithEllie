namespace SellWithEllie.Services;

// Content-type on an upload is caller-supplied and trivially spoofed, so
// before anything touches blob storage we sniff the first bytes of the file
// and confirm they match a format we actually allow, and that the filename's
// extension is consistent with it. Not a substitute for AV scanning, but it
// stops the obvious "rename evil.html to clip.mp4" and polyglot attempts.
public static class UploadValidation
{
    private static readonly string[] ImageExtensions = { ".jpg", ".jpeg", ".png", ".webp", ".gif" };
    private static readonly string[] VideoExtensions = { ".mp4", ".m4v", ".mov", ".webm" };

    public static bool TryValidate(IFormFile file, out string error)
    {
        error = string.Empty;

        var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? string.Empty;
        var isImageExt = ImageExtensions.Contains(ext);
        var isVideoExt = VideoExtensions.Contains(ext);
        if (!isImageExt && !isVideoExt)
        {
            error = $"'{file.FileName}' has an unsupported file extension.";
            return false;
        }

        Span<byte> head = stackalloc byte[16];
        int read;
        using (var stream = file.OpenReadStream())
        {
            read = stream.Read(head);
        }
        head = head[..read];

        var kind = Sniff(head);
        if (kind == FileKind.Unknown)
        {
            error = $"'{file.FileName}' is not a recognised image or video file.";
            return false;
        }

        var sniffedIsImage = kind is FileKind.Jpeg or FileKind.Png or FileKind.Gif or FileKind.Webp;
        if (sniffedIsImage != isImageExt)
        {
            error = $"'{file.FileName}' contents don't match its extension.";
            return false;
        }

        return true;
    }

    private enum FileKind { Unknown, Jpeg, Png, Gif, Webp, Mp4, WebmMkv }

    private static FileKind Sniff(ReadOnlySpan<byte> b)
    {
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF)
            return FileKind.Jpeg;

        if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 &&
            b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A)
            return FileKind.Png;

        if (b.Length >= 4 && b[0] == 0x47 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x38)
            return FileKind.Gif;

        // RIFF....WEBP
        if (b.Length >= 12 && b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46 &&
            b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50)
            return FileKind.Webp;

        // EBML header -> Matroska / WebM
        if (b.Length >= 4 && b[0] == 0x1A && b[1] == 0x45 && b[2] == 0xDF && b[3] == 0xA3)
            return FileKind.WebmMkv;

        // ISO Base Media (mp4) / QuickTime (mov): "ftyp" box at offset 4
        if (b.Length >= 8 && b[4] == 0x66 && b[5] == 0x74 && b[6] == 0x79 && b[7] == 0x70)
            return FileKind.Mp4;

        return FileKind.Unknown;
    }
}
