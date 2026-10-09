using SellWithEllie.Models;

namespace SellWithEllie.Services;

public interface ITokenService
{
    (string Token, DateTime ExpiresAtUtc) GenerateToken(ApplicationUser user, IList<string> roles);
}
