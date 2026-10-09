namespace SellWithEllie.Config;

// Bound from the "BlobStorage" configuration section. ConnectionString is
// sensitive - set it via
// `dotnet user-secrets set "BlobStorage:ConnectionString" "DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"`
// in development, never in appsettings.json. ContainerName/MaxFileSizeBytes
// aren't secret and can live in appsettings.json directly.
public class BlobStorageSettings
{
    public const string SectionName = "BlobStorage";

    // Azure Storage account connection string (Portal > Storage account >
    // Access keys > Connection string). Left blank, product media upload
    // endpoints return 503 - browsing/buying still works fine without it.
    public string ConnectionString { get; set; } = string.Empty;

    // Blob container product media is uploaded into. Created automatically
    // (with public read access to blobs, since product photos/videos are
    // meant to be publicly viewable on the storefront) on first upload if
    // it doesn't already exist.
    public string ContainerName { get; set; } = "product-media";

    // Per-file upload cap. Defaults to 100 MB, generous enough for a short
    // product video while still bounding worst-case upload time/cost.
    public long MaxFileSizeBytes { get; set; } = 100 * 1024 * 1024;
}
