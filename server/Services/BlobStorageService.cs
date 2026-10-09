using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;
using SellWithEllie.Config;

namespace SellWithEllie.Services;

// Thin wrapper around Azure Blob Storage for product photo/video uploads.
// Follows the same graceful-degradation pattern as XenditClient/Xendit
// billing: when BlobStorage:ConnectionString isn't set, IsConfigured is
// false and callers (ProductsController) return 503 rather than the app
// crashing or throwing on every upload attempt.
public class BlobStorageService : IBlobStorageService
{
    private readonly BlobStorageSettings _settings;
    private readonly BlobContainerClient? _containerClient;

    public BlobStorageService(IOptions<BlobStorageSettings> settings)
    {
        _settings = settings.Value;
        _containerClient = string.IsNullOrWhiteSpace(_settings.ConnectionString)
            ? null
            : new BlobContainerClient(_settings.ConnectionString, _settings.ContainerName);
    }

    public bool IsConfigured => _containerClient is not null;

    public long MaxFileSizeBytes => _settings.MaxFileSizeBytes;

    public async Task<UploadedMedia> UploadAsync(Stream content, string fileName, string contentType, CancellationToken cancellationToken = default)
    {
        if (_containerClient is null)
        {
            throw new InvalidOperationException("Blob storage is not configured.");
        }

        // Public read access to blobs only (never full container listing) -
        // product photos/videos are meant to be viewable on the public
        // storefront via their direct URL, but the container itself
        // shouldn't be browsable.
        await _containerClient.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: cancellationToken);

        var extension = Path.GetExtension(fileName);
        var blobName = $"{Guid.NewGuid():N}{extension}";
        var blobClient = _containerClient.GetBlobClient(blobName);

        await blobClient.UploadAsync(
            content,
            new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } },
            cancellationToken);

        var isVideo = contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase);
        return new UploadedMedia(blobClient.Uri.ToString(), blobName, isVideo);
    }

    public async Task DeleteAsync(string blobName, CancellationToken cancellationToken = default)
    {
        if (_containerClient is null || string.IsNullOrWhiteSpace(blobName)) return;
        await _containerClient.DeleteBlobIfExistsAsync(blobName, cancellationToken: cancellationToken);
    }
}
