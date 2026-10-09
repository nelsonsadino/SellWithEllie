namespace SellWithEllie.Services;

// Encrypts small secrets (a shop's Xendit credentials) for storage in the
// Tenant row. Not for anything an attacker with the DB alone should be able
// to read - the AES key lives only in configuration (Payments:EncryptionKey),
// never in the database.
public interface ISecretCipher
{
    bool IsConfigured { get; }

    // Returns a self-describing string (nonce + ciphertext + tag, base64)
    // safe to persist. Throws if not configured.
    string Encrypt(string plaintext);

    // Returns null if the stored value can't be decrypted with the current
    // key (wrong/rotated key, corruption) rather than throwing.
    string? Decrypt(string? stored);
}
