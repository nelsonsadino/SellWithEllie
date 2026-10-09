using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using SellWithEllie.Config;

namespace SellWithEllie.Services;

// AES-256-GCM. Stored format: base64( 12-byte nonce | ciphertext | 16-byte tag ),
// prefixed with "v1:" so the scheme can evolve without ambiguity.
public class SecretCipher : ISecretCipher
{
    private const string Prefix = "v1:";
    private const int NonceSize = 12;
    private const int TagSize = 16;

    private readonly byte[]? _key;

    public SecretCipher(IOptions<PaymentsSettings> settings)
    {
        var raw = settings.Value.EncryptionKey;
        if (!string.IsNullOrWhiteSpace(raw) && TryDecodeKey(raw, out var key))
        {
            _key = key;
        }
    }

    public bool IsConfigured => _key is not null;

    public string Encrypt(string plaintext)
    {
        if (_key is null)
        {
            throw new InvalidOperationException("Payments:EncryptionKey is not configured.");
        }

        var plainBytes = Encoding.UTF8.GetBytes(plaintext);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var cipher = new byte[plainBytes.Length];
        var tag = new byte[TagSize];

        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plainBytes, cipher, tag);

        var combined = new byte[NonceSize + cipher.Length + TagSize];
        Buffer.BlockCopy(nonce, 0, combined, 0, NonceSize);
        Buffer.BlockCopy(cipher, 0, combined, NonceSize, cipher.Length);
        Buffer.BlockCopy(tag, 0, combined, NonceSize + cipher.Length, TagSize);

        return Prefix + Convert.ToBase64String(combined);
    }

    public string? Decrypt(string? stored)
    {
        if (_key is null || string.IsNullOrWhiteSpace(stored) || !stored.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return null;
        }

        try
        {
            var combined = Convert.FromBase64String(stored[Prefix.Length..]);
            if (combined.Length < NonceSize + TagSize) return null;

            var nonce = combined.AsSpan(0, NonceSize);
            var cipherLen = combined.Length - NonceSize - TagSize;
            var cipher = combined.AsSpan(NonceSize, cipherLen);
            var tag = combined.AsSpan(NonceSize + cipherLen, TagSize);
            var plain = new byte[cipherLen];

            using var aes = new AesGcm(_key, TagSize);
            aes.Decrypt(nonce, cipher, tag, plain);
            return Encoding.UTF8.GetString(plain);
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static bool TryDecodeKey(string base64, out byte[] key)
    {
        key = Array.Empty<byte>();
        try
        {
            var bytes = Convert.FromBase64String(base64.Trim());
            if (bytes.Length != 32) return false;
            key = bytes;
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
