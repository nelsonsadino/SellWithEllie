namespace SellWithEllie.Services;

public record UploadedMedia(string Url, string BlobName, bool IsVideo);

public interface IBlobStorageService
{
    // False when BlobStorage:ConnectionString hasn't been configured yet -
    // callers use this to return 503 instead of attempting an upload that
    // would just throw.
    bool IsConfigured { get; }

    long MaxFileSizeBytes { get; }

    Task<UploadedMedia> UploadAsync(Stream content, string fileName, string contentType, CancellationToken cancellationToken = default);

    Task DeleteAsync(string blobName, CancellationToken cancellationToken = default);
}
