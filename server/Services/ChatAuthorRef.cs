using System.Security.Cryptography;
using System.Text;

namespace SellWithEllie.Services;

// A short, opaque, per-(scope, entity) pseudonym for a chat author. The
// client uses it only to tell "same person" / "my own message" apart within
// one auction's or raffle's thread - it can't be reversed to a user id, and
// because the scope ("auction"/"raffle") and entity id are both mixed in,
// the same user gets a different ref in every auction/raffle (and an
// auction and a raffle that happen to share a numeric id never collide),
// so refs can't be correlated across threads either.
//
// The server's JWT signing key is the only secret this feature has access
// to, but it's never used directly: HKDF derives a purpose-specific subkey
// from it first (labelled by Info below), then that subkey - not the raw
// signing key - is used as an HMAC key over the message. This keeps the
// construction a proper keyed MAC (not hash-of-concatenation) and means
// this feature's security can't be coupled to or weaken the primary
// token-signing secret, even though both start from the same config value.
public static class ChatAuthorRef
{
    private static readonly byte[] Info = Encoding.UTF8.GetBytes("sellwithellie-chat-author-ref-v1");

    public static string For(string salt, string scope, int entityId, string userId)
    {
        var subkey = HKDF.DeriveKey(HashAlgorithmName.SHA256, Encoding.UTF8.GetBytes(salt), outputLength: 32, info: Info);
        var message = Encoding.UTF8.GetBytes($"{scope}|{entityId}|{userId}");
        return Convert.ToHexString(HMACSHA256.HashData(subkey, message))[..16].ToLowerInvariant();
    }
}
